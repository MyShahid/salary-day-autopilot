import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { addDays, toIndiaDate, type ISODate } from "@/lib/engine/dates";
import { safeBuildPlan } from "@/lib/engine/plan";
import type { EventType, Plan } from "@/lib/engine/types";
import { OTHER_INCOME } from "@/lib/events";
import { addEventSchema, eventIdSchema, firstErrorMessage } from "@/lib/validation";

// Every function here takes the user from the session cookie only and scopes
// every query by that user's id. Results carry an HTTP-style status so API
// routes and server actions can share them.

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; status: 400 | 401 | 404 | 500; error: string };

const unauthorized = { ok: false, status: 401, error: "You need to log in first." } as const;
const fail = (status: 400 | 404 | 500, error: string) => ({ ok: false, status, error }) as const;

export const todayInIndia = (): ISODate => toIndiaDate(new Date())!;

/** Events older than this can't affect the plan (yearly bills look back one year). */
const EVENT_LOOKBACK_DAYS = 400;

export interface RecentEvent {
  id: string;
  type: EventType;
  amount: number;
  note: string | null;
  date: ISODate;
}

export interface HomeData {
  plan: Plan;
  today: ISODate;
  recentEvents: RecentEvent[];
  billNames: string[];
  incomeNames: string[];
}

export async function getPlanForUser(): Promise<ServiceResult<HomeData>> {
  const user = await getCurrentUser();
  if (!user) return unauthorized;
  const today = todayInIndia();

  try {
    const where = { userId: user.id };
    const [profile, bills, incomes, goals, events] = await Promise.all([
      prisma.profile.findUnique({ where }),
      prisma.bill.findMany({ where, orderBy: { priority: "asc" } }),
      prisma.income.findMany({ where, orderBy: { name: "asc" } }),
      prisma.goal.findMany({ where, orderBy: { deadline: "asc" } }),
      prisma.event.findMany({
        where: { userId: user.id, date: { gte: new Date(`${addDays(today, -EVENT_LOOKBACK_DAYS)}T00:00:00Z`) } },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const result = safeBuildPlan({ profile, bills, incomes, goals, events }, today);
    if (!result.ok) return fail(500, result.error);

    const recentEvents = [...events]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map((e) => ({ id: e.id, type: e.type, amount: e.amount, note: e.note, date: toIndiaDate(e.date)! }));

    return {
      ok: true,
      data: {
        plan: result.plan,
        today,
        recentEvents,
        billNames: bills.map((b) => b.name),
        incomeNames: incomes.map((i) => i.name),
      },
    };
  } catch (err) {
    console.error("getPlanForUser failed", err);
    return fail(500, "We couldn't load your plan right now. Please try again in a minute.");
  }
}

export async function addEvent(
  type: unknown,
  amount: unknown,
  date: unknown,
  billOrIncomeName?: unknown,
  note?: unknown,
): Promise<ServiceResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return unauthorized;

  const parsed = addEventSchema(todayInIndia()).safeParse({ type, amount, date, billOrIncomeName, note });
  if (!parsed.success) return fail(400, firstErrorMessage(parsed.error));
  const input = parsed.data;

  try {
    // The engine matches payments and income to bills/incomes by exact name, so store the user's own spelling.
    let storedNote = input.note ?? null;
    if (input.type === "bill_paid") {
      if (!input.billOrIncomeName) return fail(400, "Please choose which bill you paid.");
      const bill = await prisma.bill.findFirst({
        where: { userId: user.id, name: { equals: input.billOrIncomeName, mode: "insensitive" } },
        select: { name: true },
      });
      if (!bill) return fail(404, "We couldn't find that bill in your list.");
      storedNote = bill.name;
    } else if (input.type === "income_received" && input.billOrIncomeName && input.billOrIncomeName !== OTHER_INCOME) {
      const income = await prisma.income.findFirst({
        where: { userId: user.id, name: { equals: input.billOrIncomeName, mode: "insensitive" } },
        select: { name: true },
      });
      if (!income) return fail(404, "We couldn't find that income in your list.");
      storedNote = income.name;
    } else if (input.type === "income_received") {
      storedNote = input.note ?? "Other income";
    }

    const event = await prisma.event.create({
      data: {
        userId: user.id,
        type: input.type,
        amount: input.amount,
        note: storedNote,
        date: new Date(`${input.date}T00:00:00Z`),
      },
      select: { id: true },
    });
    return { ok: true, data: event };
  } catch (err) {
    console.error("addEvent failed", err);
    return fail(500, "We couldn't save that. Please try again.");
  }
}

/** Undo. Deleting by id and user id together means another user's entry is simply not found. */
export async function deleteEvent(id: unknown): Promise<ServiceResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return unauthorized;

  const parsed = eventIdSchema.safeParse(id);
  if (!parsed.success) return fail(404, firstErrorMessage(parsed.error));

  try {
    const { count } = await prisma.event.deleteMany({ where: { id: parsed.data, userId: user.id } });
    if (count === 0) return fail(404, "We couldn't find that entry.");
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    console.error("deleteEvent failed", err);
    return fail(500, "We couldn't undo that. Please try again.");
  }
}
