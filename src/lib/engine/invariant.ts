import type { BucketKind, Plan } from "./types";

const NEED_KINDS: ReadonlySet<BucketKind> = new Set(["carry", "rent", "emi", "bill", "card", "yearly", "living"]);

/**
 * Throws if the plan's numbers don't add up. Checks:
 * - money available = opening balance + salary + income
 * - every bucket: whole rupees, nothing negative, left = planned - spent, planned <= target (except spending)
 * - sum of all bucket allocations = money available
 * - shortfall = (needs not funded) + (expenses no bucket could cover)
 * - every rupee paid out is either spent from a bucket, uncovered, or a bill payment beyond plan
 * - safe-to-spend is a whole number between 0 and the spending money left
 * - status is "short" exactly when there is a shortfall
 * - decisions have positive whole amounts and readable sentences
 */
export function checkInvariant(plan: Plan): void {
  const problems: string[] = [];
  const rupees = (n: number) => Number.isSafeInteger(n) && n >= 0;
  const { money } = plan;

  if (![money.openingBalance, money.salary, money.income, money.available].every(rupees)) {
    problems.push("Money-in figures must be whole, non-negative rupees.");
  }
  if (money.available !== money.openingBalance + money.salary + money.income) {
    problems.push(`Money available (${money.available}) isn't balance + salary + income.`);
  }

  let planned = 0;
  let spent = 0;
  let unfunded = 0;
  for (const b of plan.buckets) {
    for (const [field, value] of Object.entries({ target: b.target, planned: b.planned, spent: b.spent, left: b.left })) {
      if (!rupees(value)) problems.push(`${b.name}: ${field} is ${value}.`);
    }
    if (b.left !== b.planned - b.spent) problems.push(`${b.name}: left isn't planned minus spent.`);
    if (b.kind !== "spending" && b.planned > b.target) problems.push(`${b.name}: planned is more than it needs.`);
    if (NEED_KINDS.has(b.kind)) unfunded += b.target - b.planned;
    planned += b.planned;
    spent += b.spent;
  }
  if (planned !== money.available) {
    problems.push(`Buckets add up to ${planned} but money available is ${money.available}.`);
  }

  const { unfundedNeeds, uncoveredSpending } = plan.shortfallParts;
  if (unfundedNeeds !== unfunded) problems.push(`Unfunded needs should be ${unfunded}, not ${unfundedNeeds}.`);
  if (uncoveredSpending !== plan.outflows.uncovered) problems.push("Uncovered spending doesn't match outflows.");
  if (plan.shortfall !== unfundedNeeds + uncoveredSpending) problems.push("Shortfall isn't the sum of its parts.");
  if (spent + plan.outflows.uncovered + plan.outflows.paidBeyondPlan !== plan.outflows.total) {
    problems.push(`Money paid out (${plan.outflows.total}) isn't fully accounted for.`);
  }

  const spending = plan.buckets.find((b) => b.kind === "spending");
  if (!rupees(plan.safeToSpendToday) || plan.safeToSpendToday > (spending?.left ?? 0)) {
    problems.push(`Safe to spend today (${plan.safeToSpendToday}) is out of range.`);
  }
  if ((plan.status === "short") !== plan.shortfall > 0) problems.push("Status doesn't match the shortfall.");

  for (const d of plan.decisions) {
    if (!Number.isSafeInteger(d.amount) || d.amount <= 0) problems.push(`Decision amount ${d.amount} is invalid.`);
    if (!d.sentence || /%|NaN|undefined|null/.test(d.sentence)) problems.push(`Bad decision sentence: "${d.sentence}"`);
  }

  if (problems.length > 0) throw new Error(`Plan doesn't add up: ${problems.join(" ")}`);
}
