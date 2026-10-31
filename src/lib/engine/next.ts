import { addDays, daysBetween, payCycle, type ISODate } from "./dates";
import { formatDate, formatRupees as rs } from "./format";
import { buildPlan, EngineInputError, planCycle } from "./plan";
import type { Decision, EngineBill, EngineGoal, NextSalaryPlan, PlanInput } from "./types";
import { cleanInput } from "./validate";

/**
 * Plans the coming cycle: from the next actual pay date to the one after.
 * Starting money = expected salary (after unpaid leave) + carry-in, where
 * carry-in = this cycle's buffer left minus this cycle's shortfall.
 */
export function buildNextSalaryPlan(input: PlanInput, today: Date | ISODate): NextSalaryPlan {
  const current = buildPlan(input, today);
  const clean = cleanInput(input);
  const { profile, settings } = clean;
  const fmt = (d: ISODate) => formatDate(d, current.today);

  const payDate = current.cycle.end;
  const nextCycle = payCycle(payDate, profile.payDay, settings.holidays);
  const warnings: string[] = [...clean.nextSalaryWarnings];

  // A late salary still belongs to this cycle, so it can't land on or after the following pay date.
  let salaryDate = payDate;
  if (profile.nextSalaryDate && profile.nextSalaryDate > payDate) {
    salaryDate = profile.nextSalaryDate < nextCycle.end ? profile.nextSalaryDate : addDays(nextCycle.end, -1);
    if (salaryDate !== profile.nextSalaryDate) {
      warnings.push(`Your late salary date is after the following payday, so ${fmt(salaryDate)} is used.`);
    }
  }
  const late = salaryDate > payDate;

  const leaveDays = profile.unpaidLeaveDays;
  const leaveCut = Math.min(profile.salaryAmount, Math.round((profile.salaryAmount * leaveDays) / 30));

  // What this cycle puts aside is still there next cycle: yearly set-asides and goal money.
  // Spending money is assumed spent; the buffer comes across as part of the carry-in.
  const now = new Map(current.buckets.map((b) => [b.id, b]));
  const bills: EngineBill[] = clean.bills.map((b) => {
    const bucket = now.get(`bill:${b.id}`);
    // Due this cycle means it gets paid this cycle, so next year's starts again from nothing.
    const setAsideSoFar =
      bucket?.kind === "yearly" ? (bucket.dueDates.length > 0 ? 0 : b.setAsideSoFar + bucket.target) : b.setAsideSoFar;
    return { ...b, setAsideSoFar };
  });
  const goals: EngineGoal[] = clean.goals.map((g) => ({ ...g, savedAmount: g.savedAmount + (now.get(`goal:${g.id}`)?.left ?? 0) }));

  const nextInput: PlanInput = {
    profile: { salaryAmount: profile.salaryAmount, payDay: profile.payDay, currentBalance: 0 },
    bills,
    incomes: clean.incomes,
    goals,
    events: [],
    settings,
  };
  const leave = leaveCut > 0 ? { days: leaveDays, cut: leaveCut } : null;
  // Spending per day starts when the salary actually lands.
  const planToday = salaryDate;

  // ---- Bills due before a late salary: pay from this cycle's spending money, then its buffer ----
  const leadDecisions: Decision[] = [];
  const lateWarnings: string[] = [];
  const prepaid = new Map<string, number>();
  const bufferStart = now.get("buffer")?.left ?? 0;
  let spendingLeft = now.get("spending")?.left ?? 0;
  let bufferLeft = bufferStart;

  if (late) {
    const provisional = planCycle(nextInput, planToday, { carryIn: 0, salaryDate, leave, prepaid, leadDecisions: [] });
    const early = provisional.upcomingBills.filter((u) => u.dueDate >= payDate && u.dueDate < salaryDate);
    const dates = [...new Set(early.map((u) => u.dueDate))];
    for (const date of dates) {
      const onDate = early.filter((u) => u.dueDate === date);
      let uncovered = 0;
      for (const u of onDate) {
        const fromSpending = Math.min(spendingLeft, u.amount);
        spendingLeft -= fromSpending;
        const fromBuffer = Math.min(bufferLeft, u.amount - fromSpending);
        bufferLeft -= fromBuffer;
        const covered = fromSpending + fromBuffer;
        uncovered += u.amount - covered;
        if (covered > 0) {
          prepaid.set(u.billId, (prepaid.get(u.billId) ?? 0) + covered);
          const sources = [fromSpending > 0 ? "spending money" : "", fromBuffer > 0 ? "emergency buffer" : ""].filter(Boolean).join(" and ");
          leadDecisions.push({
            kind: "cover_expense",
            amount: covered,
            from: "this_cycle",
            to: u.billId,
            sentence: `Pay ${covered < u.amount ? `${rs(covered)} of ` : ""}${u.name} (${rs(u.amount)}, due ${fmt(u.dueDate)}) from this month's ${sources}, because your salary comes on ${fmt(salaryDate)}.`,
          });
        }
      }
      if (uncovered > 0) {
        const total = onDate.reduce((t, u) => t + u.amount, 0);
        const days = daysBetween(date, salaryDate);
        const sentence = `${rs(total)} due on ${fmt(date)} but salary comes ${fmt(salaryDate)} — you'll be ${rs(uncovered)} short for ${days} day${days === 1 ? "" : "s"}.`;
        lateWarnings.push(sentence);
        leadDecisions.push({ kind: "shortfall", amount: uncovered, from: "this_cycle", to: "none", sentence });
      }
    }
  }

  const carryIn = bufferLeft - current.shortfall;
  const plan = planCycle(nextInput, planToday, { carryIn, salaryDate, leave, prepaid, leadDecisions });
  plan.warnings = [...lateWarnings, ...warnings, ...plan.warnings];

  return {
    payDate,
    salaryDate,
    late,
    fullSalary: profile.salaryAmount,
    unpaidLeaveDays: leaveDays,
    leaveCut,
    expectedSalary: profile.salaryAmount - leaveCut,
    carryIn,
    plan,
  };
}

/** Never throws. */
export function safeBuildNextSalaryPlan(
  input: unknown,
  today: unknown,
): { ok: true; next: NextSalaryPlan } | { ok: false; error: string } {
  try {
    return { ok: true, next: buildNextSalaryPlan(input as PlanInput, today as Date | ISODate) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof EngineInputError ? err.message : "Something went wrong working out your next salary.",
    };
  }
}
