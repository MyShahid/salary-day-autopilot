import { daysBetween, type ISODate } from "./dates";
import { formatDate, formatRupees as rs } from "./format";
import { billsBeforeLateSalary, buildPlan, EngineInputError, planCycle, prepareNextCycle } from "./plan";
import type { Decision, NextSalaryPlan, PlanInput } from "./types";

/**
 * Plans the coming cycle: from the next actual pay date to the one after.
 * Starting money = expected salary (after unpaid leave) + carry-in, where
 * carry-in = this cycle's buffer left minus this cycle's shortfall.
 */
export function buildNextSalaryPlan(input: PlanInput, today: Date | ISODate): NextSalaryPlan {
  const current = buildPlan(input, today);
  const setup = prepareNextCycle(input, current);
  const { payDate, salaryDate, late, leave } = setup;
  const fmt = (d: ISODate) => formatDate(d, current.today);
  const now = new Map(current.buckets.map((b) => [b.id, b]));

  // ---- Bills due before a late salary: paid from the spending money this cycle kept back
  // for them (plus any spending money left), then this cycle's buffer.
  const leadDecisions: Decision[] = [];
  const lateWarnings: string[] = [];
  const prepaid = new Map<string, number>();
  let spendingLeft = (now.get("hold")?.left ?? 0) + (now.get("spending")?.left ?? 0);
  let bufferLeft = now.get("buffer")?.left ?? 0;

  const early = billsBeforeLateSalary(setup);
  for (const date of [...new Set(early.map((u) => u.dueDate))]) {
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
      const sentence = `${rs(total)} due on ${fmt(date)} but salary comes ${fmt(salaryDate)}. You'll be ${rs(uncovered)} short for ${days} day${days === 1 ? "" : "s"}.`;
      lateWarnings.push(sentence);
      leadDecisions.push({ kind: "shortfall", amount: uncovered, from: "this_cycle", to: "none", sentence });
    }
  }

  const carryIn = bufferLeft - current.shortfall;
  const plan = planCycle(setup.nextInput, setup.planToday, { carryIn, salaryDate, leave, prepaid, leadDecisions });
  plan.warnings = [...lateWarnings, ...setup.warnings, ...plan.warnings];

  return {
    payDate,
    salaryDate,
    late,
    fullSalary: setup.fullSalary,
    unpaidLeaveDays: setup.leaveDays,
    leaveCut: setup.leaveCut,
    expectedSalary: setup.fullSalary - setup.leaveCut,
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
