import type { Bill, Goal, Income, Profile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { todayInIndia } from "@/lib/plan-service";
import { fail, unauthorized, type ServiceResult } from "@/lib/service-result";
import {
  balanceSchema,
  billSchema,
  firstErrorMessage,
  goalSchema,
  incomeSchema,
  itemIdSchema,
  nameSchema,
  nextSalarySchema,
  profileSchema,
} from "@/lib/validation";

// "My details": every read and write is scoped to the logged-in user. Updates and
// deletes match on id AND userId, so someone else's record is simply not found (404).

type Ok<T> = Promise<ServiceResult<T>>;

/** Runs `fn` for the logged-in user, turning unexpected errors into a plain message. */
async function asUser<T>(fn: (userId: string) => Ok<T>, failMessage = "We couldn't save that. Please try again."): Ok<T> {
  const user = await getCurrentUser();
  if (!user) return unauthorized;
  try {
    return await fn(user.id);
  } catch (err) {
    console.error("settings-service failed", err);
    return fail(500, failMessage);
  }
}

export interface SettingsData {
  profile: Profile | null;
  bills: Bill[];
  incomes: Income[];
  goals: Goal[];
}

export function getSettingsData(): Ok<SettingsData> {
  return asUser(async (userId) => {
    const where = { userId };
    const [profile, bills, incomes, goals] = await Promise.all([
      prisma.profile.findUnique({ where }),
      prisma.bill.findMany({ where, orderBy: [{ priority: "asc" }, { name: "asc" }] }),
      prisma.income.findMany({ where, orderBy: { name: "asc" } }),
      prisma.goal.findMany({ where, orderBy: { deadline: "asc" } }),
    ]);
    return { ok: true, data: { profile, bills, incomes, goals } };
  }, "We couldn't load your details right now. Please try again in a minute.");
}

// ---- Profile -------------------------------------------------------------------

export function updateProfile(input: unknown): Ok<{ saved: true }> {
  return asUser(async (userId) => {
    const parsed = profileSchema.safeParse(input ?? {});
    if (!parsed.success) return fail(400, firstErrorMessage(parsed.error));
    await prisma.profile.upsert({
      where: { userId },
      update: parsed.data,
      create: { userId, ...parsed.data, currentBalance: 0 },
    });
    return { ok: true, data: { saved: true } };
  });
}

export function updateName(input: unknown): Ok<{ saved: true }> {
  return asUser(async (userId) => {
    const parsed = nameSchema.safeParse(input ?? {});
    if (!parsed.success) return fail(400, firstErrorMessage(parsed.error));
    await prisma.user.update({ where: { id: userId }, data: { name: parsed.data.name } });
    return { ok: true, data: { saved: true } };
  });
}

/** Unpaid leave days and a late salary date. Both reset once a salary is logged as received. */
export function updateNextSalary(input: unknown): Ok<{ saved: true }> {
  return asUser(async (userId) => {
    const parsed = nextSalarySchema(todayInIndia()).safeParse(input ?? {});
    if (!parsed.success) return fail(400, firstErrorMessage(parsed.error));
    const data = {
      unpaidLeaveDays: parsed.data.unpaidLeaveDays,
      nextSalaryDate: parsed.data.nextSalaryDate ? new Date(`${parsed.data.nextSalaryDate}T00:00:00Z`) : null,
    };
    await prisma.profile.upsert({
      where: { userId },
      update: data,
      create: { userId, salaryAmount: 0, payDay: 1, currentBalance: 0, ...data },
    });
    return { ok: true, data: { saved: true } };
  });
}

/** Saving the balance also stamps balanceAsOf = now: the plan starts from this moment. */
export function updateBalance(input: unknown): Ok<{ saved: true }> {
  return asUser(async (userId) => {
    const parsed = balanceSchema.safeParse(input ?? {});
    if (!parsed.success) return fail(400, firstErrorMessage(parsed.error));
    const balanceAsOf = new Date();
    await prisma.profile.upsert({
      where: { userId },
      update: { currentBalance: parsed.data.currentBalance, balanceAsOf },
      create: { userId, salaryAmount: 0, payDay: 1, currentBalance: parsed.data.currentBalance, balanceAsOf },
    });
    return { ok: true, data: { saved: true } };
  });
}

// ---- Bills ----------------------------------------------------------------------

async function nameTaken(model: "bill" | "income", userId: string, name: string, exceptId?: string) {
  const where = { userId, name: { equals: name, mode: "insensitive" as const }, ...(exceptId ? { NOT: { id: exceptId } } : {}) };
  const found = model === "bill" ? await prisma.bill.findFirst({ where }) : await prisma.income.findFirst({ where });
  return found !== null;
}

export function createBill(input: unknown): Ok<{ id: string }> {
  return asUser(async (userId) => {
    const parsed = billSchema.safeParse(input ?? {});
    if (!parsed.success) return fail(400, firstErrorMessage(parsed.error));
    if (await nameTaken("bill", userId, parsed.data.name)) {
      return fail(400, `You already have a bill called "${parsed.data.name}".`);
    }
    // New bills go last in priority; existing order is kept.
    const last = await prisma.bill.findFirst({ where: { userId }, orderBy: { priority: "desc" }, select: { priority: true } });
    const bill = await prisma.bill.create({
      data: { ...parsed.data, userId, priority: (last?.priority ?? 0) + 1 },
      select: { id: true },
    });
    return { ok: true, data: bill };
  });
}

export function updateBill(id: unknown, input: unknown): Ok<{ id: string }> {
  return asUser(async (userId) => {
    const billId = itemIdSchema.safeParse(id);
    if (!billId.success) return fail(404, "We couldn't find that bill.");
    const existing = await prisma.bill.findFirst({ where: { id: billId.data, userId }, select: { name: true } });
    if (!existing) return fail(404, "We couldn't find that bill.");
    const parsed = billSchema.safeParse(input ?? {});
    if (!parsed.success) return fail(400, firstErrorMessage(parsed.error));
    if (await nameTaken("bill", userId, parsed.data.name, billId.data)) {
      return fail(400, `You already have a bill called "${parsed.data.name}".`);
    }
    await prisma.$transaction([
      prisma.bill.updateMany({ where: { id: billId.data, userId }, data: parsed.data }),
      // Payments are matched to bills by name, so a rename carries its payments along.
      prisma.event.updateMany({
        where: { userId, type: "bill_paid", note: { equals: existing.name, mode: "insensitive" } },
        data: { note: parsed.data.name },
      }),
    ]);
    return { ok: true, data: { id: billId.data } };
  });
}

export function deleteBill(id: unknown): Ok<{ id: string }> {
  return asUser(async (userId) => {
    const billId = itemIdSchema.safeParse(id);
    if (!billId.success) return fail(404, "We couldn't find that bill.");
    const { count } = await prisma.bill.deleteMany({ where: { id: billId.data, userId } });
    if (count === 0) return fail(404, "We couldn't find that bill.");
    return { ok: true, data: { id: billId.data } };
  }, "We couldn't delete that. Please try again.");
}

// ---- Incomes --------------------------------------------------------------------

export function createIncome(input: unknown): Ok<{ id: string }> {
  return asUser(async (userId) => {
    const parsed = incomeSchema.safeParse(input ?? {});
    if (!parsed.success) return fail(400, firstErrorMessage(parsed.error));
    if (await nameTaken("income", userId, parsed.data.name)) {
      return fail(400, `You already have an income called "${parsed.data.name}".`);
    }
    const income = await prisma.income.create({ data: { ...parsed.data, userId }, select: { id: true } });
    return { ok: true, data: income };
  });
}

export function updateIncome(id: unknown, input: unknown): Ok<{ id: string }> {
  return asUser(async (userId) => {
    const incomeId = itemIdSchema.safeParse(id);
    if (!incomeId.success) return fail(404, "We couldn't find that income.");
    const existing = await prisma.income.findFirst({ where: { id: incomeId.data, userId }, select: { name: true } });
    if (!existing) return fail(404, "We couldn't find that income.");
    const parsed = incomeSchema.safeParse(input ?? {});
    if (!parsed.success) return fail(400, firstErrorMessage(parsed.error));
    if (await nameTaken("income", userId, parsed.data.name, incomeId.data)) {
      return fail(400, `You already have an income called "${parsed.data.name}".`);
    }
    await prisma.$transaction([
      prisma.income.updateMany({ where: { id: incomeId.data, userId }, data: parsed.data }),
      prisma.event.updateMany({
        where: { userId, type: "income_received", note: { equals: existing.name, mode: "insensitive" } },
        data: { note: parsed.data.name },
      }),
    ]);
    return { ok: true, data: { id: incomeId.data } };
  });
}

export function deleteIncome(id: unknown): Ok<{ id: string }> {
  return asUser(async (userId) => {
    const incomeId = itemIdSchema.safeParse(id);
    if (!incomeId.success) return fail(404, "We couldn't find that income.");
    const { count } = await prisma.income.deleteMany({ where: { id: incomeId.data, userId } });
    if (count === 0) return fail(404, "We couldn't find that income.");
    return { ok: true, data: { id: incomeId.data } };
  }, "We couldn't delete that. Please try again.");
}

// ---- Goals ----------------------------------------------------------------------

function goalData(data: { name: string; targetAmount: number; savedAmount: number; deadline: string }) {
  return { ...data, deadline: new Date(`${data.deadline}T00:00:00Z`) };
}

export function createGoal(input: unknown): Ok<{ id: string }> {
  return asUser(async (userId) => {
    const parsed = goalSchema(todayInIndia()).safeParse(input ?? {});
    if (!parsed.success) return fail(400, firstErrorMessage(parsed.error));
    const goal = await prisma.goal.create({ data: { ...goalData(parsed.data), userId }, select: { id: true } });
    return { ok: true, data: goal };
  });
}

export function updateGoal(id: unknown, input: unknown): Ok<{ id: string }> {
  return asUser(async (userId) => {
    const goalId = itemIdSchema.safeParse(id);
    if (!goalId.success) return fail(404, "We couldn't find that goal.");
    const parsed = goalSchema(todayInIndia()).safeParse(input ?? {});
    // Ownership first, so another user's id is a 404 even when the input is also bad.
    const { count } = parsed.success
      ? await prisma.goal.updateMany({ where: { id: goalId.data, userId }, data: goalData(parsed.data) })
      : { count: await prisma.goal.count({ where: { id: goalId.data, userId } }) };
    if (count === 0) return fail(404, "We couldn't find that goal.");
    if (!parsed.success) return fail(400, firstErrorMessage(parsed.error));
    return { ok: true, data: { id: goalId.data } };
  });
}

export function deleteGoal(id: unknown): Ok<{ id: string }> {
  return asUser(async (userId) => {
    const goalId = itemIdSchema.safeParse(id);
    if (!goalId.success) return fail(404, "We couldn't find that goal.");
    const { count } = await prisma.goal.deleteMany({ where: { id: goalId.data, userId } });
    if (count === 0) return fail(404, "We couldn't find that goal.");
    return { ok: true, data: { id: goalId.data } };
  }, "We couldn't delete that. Please try again.");
}
