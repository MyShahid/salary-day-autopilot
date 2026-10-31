import { describe, expect, it } from "vitest";
import { checkInvariant } from "../invariant";
import { buildNextSalaryPlan } from "../next";
import type { EngineProfile, PlanInput } from "../types";
import { arjun, bucket, ev, plan } from "./fixtures";

// 31 Oct 2026: this cycle ends Mon 9 Nov, but the salary is late until Thu 12 Nov.
// Money sent home (₹5,000) and Phone and internet (₹1,000) are due 10 Nov, before it lands.
const OCT_31 = "2026-10-31";
const LATE = "2026-11-12";

function withProfile(extra: Partial<EngineProfile>, base: PlanInput = arjun()): PlanInput {
  return { ...base, profile: { ...base.profile, ...extra } };
}

describe("Late salary takes this month's money for bills due before it", () => {
  it("removes the held money from this month's safe-to-spend, with one decision", () => {
    const onTime = plan(arjun(), OCT_31);
    const late = plan(withProfile({ nextSalaryDate: LATE }), OCT_31);

    expect(onTime.safeToSpendToday).toBe(333); // ₹3,000 over 9 days
    expect(bucket(late, "Kept for bills before late salary")).toMatchObject({ target: 6000, planned: 3000 });
    expect(bucket(late, "Spending money").planned).toBe(0);
    expect(late.safeToSpendToday).toBe(0);
    expect(late.money.available).toBe(onTime.money.available);

    const holds = late.decisions.filter((d) => d.to === "hold");
    expect(holds.map((d) => d.sentence)).toEqual([
      "Kept ₹3,000 of this month's spending money towards the ₹6,000 for Money sent home and Phone and internet (due 10 Nov), because your salary comes on 12 Nov.",
    ]);
  });

  it("holds the full amount when there's enough, and the next plan pays from it", () => {
    const input = withProfile({ currentBalance: 60000, balanceAsOf: OCT_31, nextSalaryDate: LATE });
    const without = plan(withProfile({ currentBalance: 60000, balanceAsOf: OCT_31 }), OCT_31);
    const p = plan(input, OCT_31);

    expect(bucket(without, "Spending money").planned).toBe(25858);
    expect(bucket(p, "Kept for bills before late salary").planned).toBe(6000);
    expect(bucket(p, "Spending money").planned).toBe(19858);
    expect(without.safeToSpendToday).toBe(2873); // floor(25,858 / 9)
    expect(p.safeToSpendToday).toBe(2206); // floor(19,858 / 9)
    expect(p.decisions.find((d) => d.to === "hold")?.sentence).toBe(
      "Kept ₹6,000 of this month's spending money for Money sent home and Phone and internet (due 10 Nov), because your salary comes on 12 Nov.",
    );

    const n = buildNextSalaryPlan(input, OCT_31);
    checkInvariant(n.plan);
    expect(n.carryIn).toBe(2000); // buffer untouched
    expect(n.plan.warnings.some((w) => w.includes("short for"))).toBe(false);
    expect(bucket(n.plan, "Money sent home").target).toBe(0);
    expect(bucket(n.plan, "Phone and internet").target).toBe(0);
  });

  it("a logged expense can't use the money held for those bills", () => {
    const input = withProfile(
      { currentBalance: 60000, balanceAsOf: OCT_31, nextSalaryDate: LATE },
      arjun([ev("expense", 20000, OCT_31, "Phone repair")]),
    );
    const p = plan(input, OCT_31);
    expect(bucket(p, "Kept for bills before late salary")).toMatchObject({ planned: 6000, spent: 0, left: 6000 });
    expect(bucket(p, "Spending money")).toMatchObject({ planned: 19858, spent: 19858 });
    expect(bucket(p, "Emergency buffer").spent).toBe(142);
  });

  it("on-time salary: no hold bucket, nothing changes", () => {
    const p = plan(withProfile({ nextSalaryDate: "2026-11-09" }), OCT_31);
    expect(p.buckets.some((b) => b.kind === "hold")).toBe(false);
    expect(p.safeToSpendToday).toBe(333);
  });
});
