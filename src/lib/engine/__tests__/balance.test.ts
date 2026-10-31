import { describe, expect, it } from "vitest";
import type { EngineEvent, PlanInput } from "../types";
import { arjun, bucket, ev, plan } from "./fixtures";

// Arjun signs up on Sat 31 Oct 2026. October's salary came on Wed 7 Oct; the next is Mon 9 Nov.
const OCT_31 = "2026-10-31";

function startingAt(currentBalance: number, balanceAsOf: string | Date, events: EngineEvent[] = []): PlanInput {
  const input = arjun(events);
  return { ...input, profile: { ...input.profile, currentBalance, balanceAsOf } };
}

describe("Starting mid-cycle from today's balance", () => {
  it("sign-up on 31 Oct with ₹20,000: no overdue Oct bills, salary not double counted, rent and EMI reserved, exact shortfall + warning", () => {
    const p = plan(startingAt(20000, OCT_31), OCT_31);

    expect(p.cycle).toEqual({ start: "2026-10-07", end: "2026-11-09", daysLeft: 9 });
    expect(p.money).toMatchObject({ openingBalance: 20000, salary: 0, salaryInBalance: true, available: 20000 });

    // 10 Oct bills were due before the balance, so they're paid: not overdue, not reserved again.
    expect(p.upcomingBills.map((u) => [u.name, u.dueDate, u.overdue])).toEqual([
      ["Rent", "2026-11-01", false],
      ["Bike EMI", "2026-11-05", false],
    ]);
    expect(bucket(p, "Money sent home")).toMatchObject({ target: 0, planned: 0 });
    expect(bucket(p, "Phone and internet")).toMatchObject({ target: 0, planned: 0 });
    expect(p.decisions.filter((d) => d.kind === "already_paid").map((d) => d.sentence)).toEqual([
      "Treated Money sent home (₹5,000, due 10 Oct) as already paid, because it was due before you entered your balance on 31 Oct.",
      "Treated Phone and internet (₹1,000, due 10 Oct) as already paid, because it was due before you entered your balance on 31 Oct.",
    ]);
    expect(p.decisions.find((d) => d.kind === "skip_income" && d.from === "salary")?.sentence).toBe(
      "Did not add your ₹45,000 salary from 7 Oct again: it is already in the balance you entered on 31 Oct.",
    );

    // Rent first, then EMI, from the ₹20,000. Rent + EMI = ₹21,000, so EMI is ₹1,000 short.
    expect(bucket(p, "Rent")).toMatchObject({ target: 15000, planned: 15000 });
    expect(bucket(p, "Bike EMI")).toMatchObject({ target: 6000, planned: 5000 });
    // Groceries only for the 9 days left of a 33-day cycle: ceil(8,000 × 9 / 33) = 2,182.
    expect(bucket(p, "Groceries and commute")).toMatchObject({ target: 2182, planned: 0 });
    expect(bucket(p, "Bike insurance")).toMatchObject({ target: 960, planned: 0 });

    expect(p.shortfall).toBe(4142); // 1,000 + 960 + 2,182
    expect(p.status).toBe("short");
    expect(p.headline).toBe("Short by ₹4,142");
    expect(p.warnings).toContain(
      "You're ₹4,142 short before payday on 9 Nov: Bike EMI, Bike insurance and Groceries and commute aren't fully covered.",
    );
    expect(p.nextAction).toBe("Find ₹4,142 more before 5 Nov so Bike EMI can be paid in full.");
    expect(p.safeToSpendToday).toBe(0);
  });

  it("₹40,000 on 31 Oct covers everything until payday", () => {
    const p = plan(startingAt(40000, OCT_31), OCT_31);
    expect(p.money.available).toBe(40000);
    const planned = Object.fromEntries(p.buckets.map((b) => [b.name, b.planned]));
    expect(planned).toMatchObject({
      Rent: 15000,
      "Bike EMI": 6000,
      "Money sent home": 0,
      "Phone and internet": 0,
      "Bike insurance": 960,
      "Groceries and commute": 2182,
      "Emergency buffer": 2000,
      Laptop: 8000,
      "Spending money": 5858,
    });
    expect(p.shortfall).toBe(0);
    expect(p.status).toBe("okay");
    expect(p.safeToSpendToday).toBe(650); // floor(5,858 / 9)
  });

  it("roommate share due before the balance isn't listed as expected", () => {
    expect(plan(startingAt(20000, OCT_31), OCT_31).expectedNotCounted).toEqual([]);
  });

  it("events before the balance are ignored; events after it count", () => {
    const p = plan(
      startingAt(40000, OCT_31, [
        ev("salary_received", 45000, "2026-10-07"),
        ev("bill_paid", 5000, "2026-10-10", "Money sent home"),
        ev("expense", 5000, "2026-10-20", "Old expense"),
        ev("expense", 1000, "2026-11-01", "Auto"),
      ]),
      "2026-11-02",
    );
    expect(p.money.available).toBe(40000);
    expect(p.outflows.total).toBe(1000);
    expect(bucket(p, "Spending money").spent).toBe(1000);
  });

  it("on the balance day, only entries logged after the balance count", () => {
    const at = new Date("2026-10-31T06:00:00Z");
    const p = plan(
      startingAt(40000, at, [
        { ...ev("expense", 2000, OCT_31, "Before"), createdAt: "2026-10-31T05:00:00Z" },
        { ...ev("expense", 500, OCT_31, "After"), createdAt: "2026-10-31T07:00:00Z" },
      ]),
      OCT_31,
    );
    expect(p.outflows.total).toBe(500);
  });

  it("card spends before the balance are still owed, unless the card was due after them", () => {
    const p = plan(
      startingAt(40000, OCT_31, [
        ev("card_spend", 1000, "2026-10-15"), // covered by the 22 Oct card bill, which was due before the balance
        ev("card_spend", 3000, "2026-10-25"), // still owed
      ]),
      OCT_31,
    );
    expect(bucket(p, "Credit card")).toMatchObject({ target: 3000, planned: 3000 });
  });

  it("a yearly bill due before the balance counts as paid and the next one is planned", () => {
    // Cycle 8 Feb - 8 Mar 2027; insurance was due 15 Feb, before the balance on 20 Feb.
    const p = plan(startingAt(40000, "2027-02-20"), "2027-02-20");
    expect(p.upcomingBills.find((u) => u.name === "Bike insurance")).toBeUndefined();
    expect(p.decisions.some((d) => d.kind === "already_paid" && d.sentence.startsWith("Treated Bike insurance"))).toBe(true);
    // Next due 15 Feb 2028; 13 paydays from Feb 2027 to Feb 2028: ceil(4,800 / 13) = 370.
    expect(bucket(p, "Bike insurance").target).toBe(370);
  });

  it("a balance from before this cycle isn't counted, with a warning", () => {
    const p = plan(startingAt(20000, OCT_31), "2026-11-15");
    expect(p.cycle.start).toBe("2026-11-09");
    expect(p.money).toMatchObject({ openingBalance: 0, salary: 45000, salaryInBalance: false, available: 45000 });
    expect(p.warnings.join(" ")).toContain("is from 31 Oct, before this pay cycle, so it wasn't counted");
  });

  it("a balance entered on payday plans the whole cycle", () => {
    const p = plan(startingAt(45000, "2026-11-09"), "2026-11-10");
    expect(p.money.available).toBe(45000);
    expect(bucket(p, "Groceries and commute").target).toBe(8000);
    expect(p.upcomingBills.map((u) => u.name)).toEqual(["Money sent home", "Phone and internet", "Rent", "Bike EMI"]);
  });

  it("a balance date in the future or unreadable never crashes", () => {
    expect(plan(startingAt(20000, "2030-01-01"), OCT_31).money.balanceAsOf).toBe(OCT_31);
    const bad = plan(startingAt(20000, "not a date"), OCT_31);
    expect(bad.money.balanceAsOf).toBeNull();
    expect(bad.warnings.join(" ")).toContain("date of your balance isn't valid");
  });
});
