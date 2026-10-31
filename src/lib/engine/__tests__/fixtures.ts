import { buildSampleData } from "../../sample-data";
import { buildPlan } from "../plan";
import { checkInvariant } from "../invariant";
import type { Bucket, EngineEvent, EventType, Plan, PlanInput } from "../types";

/** Arjun's sign-up sample data (the same data new accounts get), as engine input. */
export function arjun(events: EngineEvent[] = []): PlanInput {
  const s = buildSampleData(new Date("2026-10-31T10:00:00Z"));
  return {
    profile: { ...s.profile.create },
    bills: s.bills.create.map((b, i) => ({ id: `b${i + 1}`, dueMonth: null, ...b })),
    incomes: s.incomes.create.map((x, i) => ({ id: `i${i + 1}`, ...x })),
    goals: s.goals.create.map((g, i) => ({ id: `g${i + 1}`, ...g })),
    events,
  };
}

export const ev = (type: EventType, amount: number, date: string, note?: string): EngineEvent => ({ type, amount, date, note });

/** Builds the plan and asserts the invariant, so every scenario is checked. */
export function plan(input: PlanInput, today: string | Date): Plan {
  const p = buildPlan(input, today);
  checkInvariant(p);
  return p;
}

export function bucket(p: Plan, name: string): Bucket {
  const b = p.buckets.find((x) => x.name === name);
  if (!b) throw new Error(`No bucket named ${name}`);
  return b;
}
