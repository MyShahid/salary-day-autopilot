import { describe, expect, it } from "vitest";
import { checkInvariant } from "../invariant";
import { buildNextSalaryPlan, safeBuildNextSalaryPlan } from "../next";
import { buildPlan } from "../plan";
import type { EngineProfile, NextSalaryPlan, PlanInput } from "../types";
import { arjun, bucket } from "./fixtures";

function next(input: PlanInput, today: string): NextSalaryPlan {
  const n = buildNextSalaryPlan(input, today);
  checkInvariant(n.plan);
  return n;
}

function withProfile(extra: Partial<EngineProfile>, base: PlanInput = arjun()): PlanInput {
  return { ...base, profile: { ...base.profile, ...extra } };
}

const planned = (n: NextSalaryPlan) => Object.fromEntries(n.plan.buckets.map((b) => [b.name, b.planned]));

describe("Next salary plan", () => {
  it("Arjun's next cycle: all bills funded and it adds up", () => {
    // Today 10 Nov: this cycle is 9 Nov - 7 Dec, so the next salary is Mon 7 Dec and runs to 7 Jan.
    const n = next(arjun(), "2026-11-10");
    expect(n).toMatchObject({ payDate: "2026-12-07", salaryDate: "2026-12-07", late: false, expectedSalary: 45000, carryIn: 2000 });
    expect(n.plan.cycle).toEqual({ start: "2026-12-07", end: "2027-01-07", daysLeft: 31 });
    expect(n.plan.money.available).toBe(47000); // 45,000 salary + 2,000 buffer carried in

    expect(planned(n)).toEqual({
      Rent: 15000,
      "Bike EMI": 6000,
      "Money sent home": 5000,
      "Phone and internet": 1000,
      "Credit card": 0,
      // This cycle set aside 1,200, so 3,600 is left over 3 paydays.
      "Bike insurance": 1200,
      "Groceries and commute": 8000, // full cycle, no proration
      "Emergency buffer": 2000,
      Laptop: 5800,
      "Spending money": 3000,
    });
    expect(n.plan.upcomingBills.every((u) => u.reserved)).toBe(true);
    expect(n.plan.upcomingBills.map((u) => [u.name, u.dueDate])).toEqual([
      ["Money sent home", "2026-12-10"],
      ["Phone and internet", "2026-12-10"],
      ["Rent", "2027-01-01"],
      ["Bike EMI", "2027-01-05"],
    ]);
    expect(n.plan.shortfall).toBe(0);
    expect(n.plan.safeToSpendToday).toBe(96); // floor(3,000 / 31)
    // Saved 12,000 + this cycle's 3,800 = 15,800; 44,200 to go over 4 paydays.
    expect(n.plan.goalStatus[0].text).toBe("needs ₹11,050/month, you can spare ₹5,800");
    expect(n.plan.decisions[0].sentence).toBe("Carried over the ₹2,000 left in this month's emergency buffer.");
  });

  it("3 unpaid leave days -> ₹4,500 less, spending cut first, rent and EMI untouched", () => {
    const n = next(withProfile({ unpaidLeaveDays: 3 }), "2026-11-10");
    expect(n).toMatchObject({ leaveCut: 4500, expectedSalary: 40500 });
    expect(n.plan.money.available).toBe(42500);
    expect(bucket(n.plan, "Spending money").planned).toBe(0);
    expect(bucket(n.plan, "Laptop").planned).toBe(4300);
    expect(bucket(n.plan, "Rent").planned).toBe(15000);
    expect(bucket(n.plan, "Bike EMI").planned).toBe(6000);

    const cuts = n.plan.decisions.filter((d) => d.kind === "cut").map((d) => d.sentence);
    expect(cuts).toEqual([
      "Your salary will be ₹4,500 less because of 3 unpaid leave days, so I cut ₹3,000 from spending money first.",
      "Moved ₹1,500 from your Laptop goal to Rent because of 3 unpaid leave days.",
    ]);
    // This month's plan isn't touched by leave on the next salary.
    expect(buildPlan(withProfile({ unpaidLeaveDays: 3 }), "2026-11-10").money.available).toBe(45000);
  });

  it("1 leave day reads in the singular and rounds to whole rupees", () => {
    const n = next(withProfile({ salaryAmount: 45001, unpaidLeaveDays: 1 }), "2026-11-10");
    expect(n.leaveCut).toBe(1500); // round(45,001 / 30) = 1,500
    expect(n.plan.decisions.find((d) => d.kind === "cut")?.sentence).toContain("because of 1 unpaid leave day,");
  });

  describe("Salary late: 9 Nov -> 12 Nov with bills due 10 Nov", () => {
    it("partly paid from this month's spare money, with the exact gap warned", () => {
      // 31 Oct, no balance date: this cycle has ₹3,000 spending money and the ₹2,000 buffer left.
      const n = next(withProfile({ nextSalaryDate: "2026-11-12" }), "2026-10-31");
      expect(n).toMatchObject({ payDate: "2026-11-09", salaryDate: "2026-11-12", late: true, carryIn: 0 });
      expect(n.plan.decisions.filter((d) => d.from === "this_cycle").map((d) => d.sentence)).toEqual([
        "Pay Money sent home (₹5,000, due 10 Nov) from this month's spending money and emergency buffer, because your salary comes on 12 Nov.",
        "₹6,000 due on 10 Nov but salary comes 12 Nov — you'll be ₹1,000 short for 2 days.",
      ]);
      expect(n.plan.warnings[0]).toBe("₹6,000 due on 10 Nov but salary comes 12 Nov — you'll be ₹1,000 short for 2 days.");
      // Money sent home is already paid; the phone bill waits for the salary.
      expect(bucket(n.plan, "Money sent home")).toMatchObject({ target: 0, planned: 0 });
      expect(bucket(n.plan, "Phone and internet")).toMatchObject({ target: 1000, planned: 1000 });
      expect(n.plan.cycle.daysLeft).toBe(25); // spending starts when the salary lands on 12 Nov
    });

    it("fully paid when this month has enough left; buffer used comes off the carry-in", () => {
      const input = withProfile({ currentBalance: 40000, balanceAsOf: "2026-10-31", nextSalaryDate: "2026-11-12" });
      const n = next(input, "2026-10-31");
      expect(n.plan.warnings.some((w) => w.includes("short for"))).toBe(false);
      expect(n.plan.decisions.filter((d) => d.from === "this_cycle").map((d) => d.sentence)).toEqual([
        "Pay Money sent home (₹5,000, due 10 Nov) from this month's spending money, because your salary comes on 12 Nov.",
        "Pay Phone and internet (₹1,000, due 10 Nov) from this month's spending money and emergency buffer, because your salary comes on 12 Nov.",
      ]);
      expect(n.carryIn).toBe(1858); // 2,000 buffer - 142 used for the phone bill
    });

    it("nothing spare this month -> the whole amount is short", () => {
      const input = withProfile({ currentBalance: 20000, balanceAsOf: "2026-10-31", nextSalaryDate: "2026-11-12" });
      const n = next(input, "2026-10-31");
      expect(n.plan.warnings[0]).toBe("₹6,000 due on 10 Nov but salary comes 12 Nov — you'll be ₹6,000 short for 2 days.");
    });

    it("a 'late' date on or before the normal pay date changes nothing", () => {
      const n = next(withProfile({ nextSalaryDate: "2026-11-09" }), "2026-10-31");
      expect(n.late).toBe(false);
      expect(n.plan.decisions.some((d) => d.from === "this_cycle")).toBe(false);
    });
  });

  it("this cycle short by ₹4,142 -> next plan starts with that deduction", () => {
    const input = withProfile({ currentBalance: 20000, balanceAsOf: "2026-10-31" });
    expect(buildPlan(input, "2026-10-31").shortfall).toBe(4142);

    const n = next(input, "2026-10-31");
    expect(n.carryIn).toBe(-4142);
    expect(n.plan.decisions[0]).toMatchObject({ kind: "reserve", amount: 4142, sentence: "₹4,142 of this salary covers last month's shortfall." });
    expect(n.plan.buckets[0]).toMatchObject({ name: "Last month's shortfall", planned: 4142, target: 4142 });
    expect(n.plan.money).toMatchObject({ openingBalance: 0, salary: 45000, available: 45000 });
    expect(bucket(n.plan, "Rent").planned).toBe(15000);
    expect(bucket(n.plan, "Bike EMI").planned).toBe(6000);
    expect(bucket(n.plan, "Groceries and commute").planned).toBe(8000);
    expect(bucket(n.plan, "Spending money").planned).toBe(2898);
    expect(n.plan.shortfall).toBe(0);
  });

  it("bill due 31st in a February cycle falls on the 28th (29th in 2028)", () => {
    const gym: PlanInput = {
      ...arjun(),
      bills: [{ id: "gym", name: "Gym", amount: 1000, dueDay: 31, frequency: "monthly", priority: 1, isVariable: false }],
    };
    const n2027 = next(gym, "2027-01-20"); // next cycle: 8 Feb - 8 Mar 2027
    expect(n2027.plan.cycle.start).toBe("2027-02-08");
    expect(n2027.plan.upcomingBills).toEqual([expect.objectContaining({ name: "Gym", dueDate: "2027-02-28" })]);
    const n2028 = next(gym, "2028-01-20"); // next cycle: 7 Feb - 7 Mar 2028
    expect(n2028.plan.upcomingBills).toEqual([expect.objectContaining({ name: "Gym", dueDate: "2028-02-29" })]);
  });

  it("bad leave days or salary dates never crash", () => {
    for (const extra of [{ unpaidLeaveDays: -2 }, { unpaidLeaveDays: 40 }, { unpaidLeaveDays: NaN }, { nextSalaryDate: "soon" }]) {
      const n = next(withProfile(extra as Partial<EngineProfile>), "2026-11-10");
      expect(n.plan.warnings.length).toBeGreaterThan(0);
    }
    expect(next(withProfile({ unpaidLeaveDays: 40 }), "2026-11-10").leaveCut).toBe(45000); // 31 days > 30: whole salary
    expect(safeBuildNextSalaryPlan(arjun(), "garbage").ok).toBe(false);
    expect(safeBuildNextSalaryPlan(null, "2026-11-10").ok).toBe(true);
  });
});
