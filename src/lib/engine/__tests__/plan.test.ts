import { describe, expect, it } from "vitest";
import { buildPlan, EngineInputError, safeBuildPlan } from "../plan";
import { checkInvariant } from "../invariant";
import type { PlanInput } from "../types";
import { arjun, bucket, ev, plan } from "./fixtures";

// Arjun is paid on the 7th. 7 Nov 2026 is a Saturday, so this cycle runs Mon 9 Nov -> Mon 7 Dec.
const NOV_10 = "2026-11-10";

describe("Arjun's normal month", () => {
  const p = plan(arjun(), NOV_10);

  it("all bills reserved, numbers add up, safe-to-spend is a sensible positive number", () => {
    expect(p.cycle).toEqual({ start: "2026-11-09", end: "2026-12-07", daysLeft: 27 });
    expect(p.money.available).toBe(45000);

    const planned = Object.fromEntries(p.buckets.map((b) => [b.name, b.planned]));
    expect(planned).toEqual({
      Rent: 15000,
      "Bike EMI": 6000,
      "Money sent home": 5000,
      "Phone and internet": 1000,
      "Credit card": 0,
      "Bike insurance": 1200,
      "Groceries and commute": 8000,
      "Emergency buffer": 2000,
      Laptop: 3800,
      "Spending money": 3000,
    });
    expect(p.buckets.reduce((t, b) => t + b.planned, 0)).toBe(45000);

    // Rent on 1 Dec and EMI on 5 Dec are before the next payday, so this salary covers them.
    expect(bucket(p, "Rent").dueDates).toEqual(["2026-12-01"]);
    expect(bucket(p, "Bike EMI").dueDates).toEqual(["2026-12-05"]);
    expect(p.upcomingBills.map((u) => [u.name, u.dueDate, u.reserved])).toEqual([
      ["Money sent home", "2026-11-10", true],
      ["Phone and internet", "2026-11-10", true],
      ["Rent", "2026-12-01", true],
      ["Bike EMI", "2026-12-05", true],
    ]);

    expect(p.safeToSpendToday).toBe(111); // floor(3000 / 27)
    expect(p.shortfall).toBe(0);
    expect(p.status).toBe("okay");
    expect(p.headline).toBe("You're okay this month");
    expect(p.nextAction).toBe("Next bill: Money sent home, ₹5,000 on 10 Nov. The money is set aside.");
    expect(p.decisions.find((d) => d.to === "bill:b1")?.sentence).toBe("Set aside ₹15,000 for Rent, due 1 Dec.");
  });
});

describe("Salary ₹8,000 short", () => {
  const p = plan(arjun([ev("salary_received", 37000, "2026-11-09")]), NOV_10);

  it("spending cut first, rent and EMI untouched, decision sentence mentions ₹8,000", () => {
    expect(p.money.available).toBe(37000);
    expect(bucket(p, "Spending money").planned).toBe(0);
    expect(bucket(p, "Laptop").planned).toBe(0);
    expect(bucket(p, "Emergency buffer").planned).toBe(800);
    expect(bucket(p, "Groceries and commute").planned).toBe(8000);
    expect(bucket(p, "Rent").planned).toBe(15000);
    expect(bucket(p, "Bike EMI").planned).toBe(6000);

    const cuts = p.decisions.filter((d) => d.kind === "cut");
    expect(cuts.map((d) => [d.from, d.amount])).toEqual([
      ["spending", 3000],
      ["goal:g1", 3800],
      ["buffer", 1200],
    ]);
    expect(cuts[0].sentence).toBe("Moved ₹3,000 from spending money to Rent because your salary was ₹8,000 short.");
    expect(cuts.every((d) => d.sentence.includes("₹8,000"))).toBe(true);

    expect(p.shortfall).toBe(0);
    expect(p.status).toBe("tight");
    expect(p.safeToSpendToday).toBe(0);
  });
});

describe("Bill due on the 31st", () => {
  const gym = (today: string) =>
    plan(
      { ...arjun(), bills: [{ id: "gym", name: "Gym", amount: 1000, dueDay: 31, frequency: "monthly", priority: 1, isVariable: false }] },
      today,
    );

  it("bill due 31st in February -> Feb 28", () => {
    expect(gym("2027-02-10").upcomingBills[0]).toMatchObject({ name: "Gym", dueDate: "2027-02-28" });
  });

  it("bill due 31st in February 2028 -> Feb 29", () => {
    expect(gym("2028-02-10").upcomingBills[0]).toMatchObject({ name: "Gym", dueDate: "2028-02-29" });
  });
});

describe("Emergency bigger than spare money", () => {
  // Groceries already bought and the 10th's bills paid, so spare money is spending 3,000 + buffer 2,000 + goal 3,800.
  const p = plan(
    arjun([
      ev("bill_paid", 8000, "2026-11-09", "Groceries and commute"),
      ev("bill_paid", 5000, "2026-11-10", "Money sent home"),
      ev("bill_paid", 1000, "2026-11-10", "Phone and internet"),
      ev("expense", 12000, "2026-11-12", "Hospital"),
    ]),
    "2026-11-13",
  );

  it("₹12,000 emergency -> exact shortfall shown, rent/EMI not touched, warning present", () => {
    expect(p.shortfall).toBe(3200); // 12,000 - 8,800
    expect(p.shortfallParts).toEqual({ unfundedNeeds: 0, uncoveredSpending: 3200 });
    expect(p.status).toBe("short");
    expect(p.headline).toBe("Short by ₹3,200");

    expect(bucket(p, "Rent")).toMatchObject({ planned: 15000, spent: 0, left: 15000 });
    expect(bucket(p, "Bike EMI")).toMatchObject({ planned: 6000, spent: 0, left: 6000 });
    expect(bucket(p, "Spending money").left).toBe(0);
    expect(bucket(p, "Emergency buffer").left).toBe(0);
    expect(bucket(p, "Laptop").left).toBe(0);

    const covers = p.decisions.filter((d) => d.kind === "cover_expense").map((d) => [d.from, d.amount]);
    expect(covers).toEqual([["spending", 3000], ["buffer", 2000], ["goal:g1", 3800]]);

    const warning = p.warnings.find((w) => w.includes("₹3,200"));
    expect(warning).toContain("Rent and Bike EMI money was not touched.");
    expect(p.nextAction).toBe("Find ₹3,200 more before 1 Dec so Rent can be paid in full.");
  });
});

describe("Roommate share (unreliable income)", () => {
  it("not received -> not counted", () => {
    const p = plan(arjun(), NOV_10);
    expect(p.money.income).toBe(0);
    expect(p.money.available).toBe(45000);
    expect(p.expectedNotCounted).toEqual([
      expect.objectContaining({ name: "Roommate share", amount: 3000, expectedDate: "2026-11-15" }),
    ]);
    expect(p.expectedNotCounted[0].text).toContain("not counted");
  });

  it("after income_received -> counted", () => {
    const p = plan(arjun([ev("income_received", 3000, "2026-11-15", "Roommate share")]), "2026-11-16");
    expect(p.money.income).toBe(3000);
    expect(p.money.available).toBe(48000);
    expect(p.expectedNotCounted).toEqual([]);
    expect(bucket(p, "Laptop").planned).toBe(6800);
  });
});

describe("Credit card", () => {
  it("card spends add up into the card bill bucket", () => {
    const p = plan(
      arjun([
        ev("card_spend", 1000, "2026-10-20"), // already paid off below
        ev("bill_paid", 1000, "2026-10-22", "Credit card"),
        ev("card_spend", 1200, "2026-11-10"),
        ev("card_spend", 800, "2026-11-11"),
        ev("card_spend", 2500, "2026-11-12"),
      ]),
      "2026-11-13",
    );
    expect(bucket(p, "Credit card")).toMatchObject({ target: 4500, planned: 4500 });
    expect(p.upcomingBills).toContainEqual(expect.objectContaining({ name: "Credit card", amount: 4500, dueDate: "2026-11-22", reserved: true }));
    // Card money comes ahead of goals and spending.
    expect(bucket(p, "Laptop").planned).toBe(0);
    expect(bucket(p, "Spending money").planned).toBe(2300);
  });

  it("paying the card this cycle counts as spent; newer spends are still owed", () => {
    const p = plan(
      arjun([
        ev("card_spend", 4500, "2026-11-12"),
        ev("bill_paid", 4500, "2026-11-22", "Credit card"),
        ev("card_spend", 600, "2026-11-23"),
      ]),
      "2026-11-24",
    );
    expect(bucket(p, "Credit card")).toMatchObject({ target: 5100, spent: 4500, left: 600 });
    expect(p.upcomingBills.find((u) => u.name === "Credit card")).toBeUndefined(); // next statement
  });
});

describe("Yearly bike insurance", () => {
  it("insurance set-aside in an off month is amount / months left", () => {
    // From the 9 Nov cycle, paydays before 15 Feb: 9 Nov, 7 Dec, 7 Jan, 8 Feb = 4.
    const nov = plan(arjun(), NOV_10);
    expect(bucket(nov, "Bike insurance").planned).toBe(1200);
    expect(nov.decisions.find((d) => d.to === "bill:b7")?.sentence).toBe(
      "Set aside ₹1,200 towards Bike insurance (₹4,800 due 15 Feb 2027, split over 4 paydays).",
    );

    // From the 7 Dec cycle: 7 Dec, 7 Jan, 8 Feb = 3.
    expect(bucket(plan(arjun(), "2026-12-10"), "Bike insurance").planned).toBe(1600);
  });

  it("rounds up so the full amount is ready on time", () => {
    const input = arjun();
    input.bills = input.bills.map((b) => (b.name === "Bike insurance" ? { ...b, amount: 5000 } : b));
    expect(bucket(plan(input, "2026-12-10"), "Bike insurance").planned).toBe(1667); // ceil(5000 / 3)
  });

  it("in the month it's due, the whole amount is reserved", () => {
    const p = plan(arjun(), "2027-02-10");
    expect(bucket(p, "Bike insurance").planned).toBe(4800);
    expect(p.upcomingBills).toContainEqual(expect.objectContaining({ name: "Bike insurance", amount: 4800, dueDate: "2027-02-15" }));
  });
});

describe("Laptop goal", () => {
  it("laptop goal not on track gives the right ₹ per month", () => {
    // ₹48,000 to go; paydays before 1 Apr 2027: 9 Nov, 7 Dec, 7 Jan, 8 Feb, 8 Mar = 5.
    const [laptop] = plan(arjun(), NOV_10).goalStatus;
    expect(laptop).toMatchObject({ name: "Laptop", remaining: 48000, monthsLeft: 5, neededPerMonth: 9600, canSpare: 3800, onTrack: false });
    expect(laptop.text).toBe("needs ₹9,600/month, you can spare ₹3,800");
  });

  it("a goal that fits is on track", () => {
    const input = arjun();
    input.goals = input.goals.map((g) => ({ ...g, savedAmount: 55000 }));
    const p = plan(input, NOV_10);
    expect(p.goalStatus[0]).toMatchObject({ neededPerMonth: 1000, canSpare: 1000, onTrack: true, text: "on track" });
    expect(bucket(p, "Spending money").planned).toBe(5800);
  });
});

describe("Bonus income", () => {
  it("bonus income_received increases what's available and goes to buffer/goal before spending", () => {
    const normal = plan(arjun(), "2026-11-13");
    const bonus = plan(arjun([ev("income_received", 5000, "2026-11-12", "Diwali bonus")]), "2026-11-13");
    expect(bonus.money.available).toBe(normal.money.available + 5000);
    expect(bucket(bonus, "Laptop").planned).toBe(bucket(normal, "Laptop").planned + 5000);
    expect(bucket(bonus, "Spending money").planned).toBe(bucket(normal, "Spending money").planned);
  });

  it("when salary is short, a bonus refills the buffer and goal, not spending", () => {
    const short = plan(arjun([ev("salary_received", 37000, "2026-11-09")]), "2026-11-13");
    const withBonus = plan(
      arjun([ev("salary_received", 37000, "2026-11-09"), ev("income_received", 5000, "2026-11-12", "Diwali bonus")]),
      "2026-11-13",
    );
    expect([bucket(short, "Emergency buffer").planned, bucket(short, "Laptop").planned]).toEqual([800, 0]);
    expect([bucket(withBonus, "Emergency buffer").planned, bucket(withBonus, "Laptop").planned]).toEqual([2000, 3800]);
    expect(bucket(withBonus, "Spending money").planned).toBe(0);
  });
});

describe("Bills bigger than salary", () => {
  it("cuts from the bottom and never touches rent or EMI first", () => {
    const input = arjun();
    input.profile = { ...input.profile, salaryAmount: 30000 };
    const p = plan(input, NOV_10);
    expect(bucket(p, "Rent").planned).toBe(15000);
    expect(bucket(p, "Bike EMI").planned).toBe(6000);
    expect(bucket(p, "Groceries and commute").planned).toBe(1800);
    expect(p.shortfall).toBe(6200);
    expect(p.headline).toBe("Short by ₹6,200");
    expect(p.nextAction).toBe("Find ₹6,200 more before payday on 7 Dec to cover Groceries and commute.");
  });
});

describe("Invalid inputs", () => {
  const base = (): PlanInput => ({ ...arjun(), events: [] });

  it("invalid inputs don't throw unhandled errors", () => {
    const bad = plan(
      { profile: { salaryAmount: NaN, payDay: 0, currentBalance: -500 }, bills: [], incomes: [], goals: [], events: [] },
      NOV_10,
    );
    expect(bad.money.available).toBe(0);
    expect(bad.warnings.join(" ")).toMatch(/salary is not a valid amount/);
    expect(bad.warnings.join(" ")).toMatch(/pay day must be a day between 1 and 31\. Using 1/);
    expect(bad.warnings.join(" ")).toMatch(/balance can't be negative/);
    expect(bad.warnings).toContain("You haven't added any bills yet.");
    expect(bad.safeToSpendToday).toBe(0);

    const day32 = plan({ ...base(), profile: { salaryAmount: 45000, payDay: 32, currentBalance: 0 } }, NOV_10);
    expect(day32.warnings.join(" ")).toMatch(/Using 31/);
    expect(day32.cycle).toMatchObject({ start: "2026-11-02", end: "2026-11-30" }); // 31 Oct is a Saturday -> Mon 2 Nov

    const messy = plan(
      {
        ...base(),
        bills: [
          { id: "a", name: "Rent", amount: -100, dueDay: 1, frequency: "monthly", priority: 1, isVariable: false },
          { id: "b", name: "Phone", amount: 1000, dueDay: 32, frequency: "monthly", priority: 2, isVariable: false },
          { id: "c", name: "Gym", amount: NaN, dueDay: 0, frequency: "monthly", priority: 3, isVariable: false },
          { id: "d", name: "Insurance", amount: 1000, dueDay: 15, frequency: "yearly", dueMonth: null, priority: 4, isVariable: false },
          { id: "e", name: "Weird", amount: 99.6, dueDay: 0, frequency: "weekly", priority: 5, isVariable: false },
          null,
        ] as unknown as PlanInput["bills"],
        events: [
          { type: "bonus", amount: 100, date: NOV_10 },
          { type: "expense", amount: "abc", date: NOV_10 },
          { type: "expense", amount: 500, date: "not a date" },
          { type: "expense", amount: 500, date: NOV_10 },
        ] as unknown as PlanInput["events"],
      },
      NOV_10,
    );
    expect(messy.buckets.filter((b) => b.dueDates.length || b.kind === "card").map((b) => b.name)).toEqual(["Phone", "Weird"]);
    expect(messy.buckets.find((b) => b.name === "Phone")?.dueDates).toEqual(["2026-11-30"]);
    expect(messy.buckets.find((b) => b.name === "Weird")?.target).toBe(100);
    expect(messy.outflows.total).toBe(500); // only the one valid expense
    expect(messy.warnings.length).toBeGreaterThanOrEqual(8);

    const zeroSalary = plan({ ...base(), profile: { salaryAmount: 0, payDay: 7, currentBalance: 10000 } }, NOV_10);
    expect(zeroSalary.money.available).toBe(10000);
    expect(zeroSalary.warnings.join(" ")).toMatch(/salary is ₹0/);
    expect(zeroSalary.status).toBe("short");

    // Wrong shapes entirely: still a plan, never a crash.
    expect(() => checkInvariant(buildPlan(null as unknown as PlanInput, NOV_10))).not.toThrow();
    expect(() => checkInvariant(buildPlan({ bills: "nope" } as unknown as PlanInput, NOV_10))).not.toThrow();
  });

  it("an unusable 'today' gives a clear error, and safeBuildPlan never throws", () => {
    expect(() => buildPlan(arjun(), "2026-13-45")).toThrow(EngineInputError);
    expect(safeBuildPlan(arjun(), "garbage")).toEqual({
      ok: false,
      error: "Today's date is not a valid date, so no plan could be made.",
    });
    expect(safeBuildPlan(arjun(), new Date(NaN)).ok).toBe(false);
    expect(safeBuildPlan(arjun(), NOV_10).ok).toBe(true);
  });
});

describe("checkInvariant", () => {
  it("passes for every scenario above (each test builds through plan(), which asserts it)", () => {
    expect(() => checkInvariant(buildPlan(arjun(), NOV_10))).not.toThrow();
  });

  it("throws when the numbers don't add up", () => {
    const p = buildPlan(arjun(), NOV_10);
    const broken = { ...p, buckets: p.buckets.map((b) => (b.name === "Rent" ? { ...b, planned: 14000, left: 14000 } : b)) };
    expect(() => checkInvariant(broken)).toThrow(/Buckets add up to 44000 but money available is 45000/);
  });

  it("every decision is a plain rupee sentence with no percentages", () => {
    const p = plan(arjun([ev("salary_received", 37000, "2026-11-09"), ev("expense", 2000, "2026-11-11")]), "2026-11-12");
    expect(p.decisions.length).toBeGreaterThan(0);
    for (const d of p.decisions) {
      expect(d.sentence).toMatch(/₹/);
      expect(d.sentence).not.toMatch(/%/);
    }
  });
});
