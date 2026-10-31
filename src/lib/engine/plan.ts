import {
  actualPayDate,
  addDays,
  addMonths,
  clampDueDate,
  daysBetween,
  payCycle,
  toIndiaDate,
  yearMonthOf,
  type ISODate,
} from "./dates";
import { formatDate, formatRupees as rs } from "./format";
import type {
  BillKind,
  Bucket,
  BucketKind,
  Decision,
  DecisionKind,
  ExpectedIncome,
  GoalStatus,
  Plan,
  PlanInput,
  UpcomingBill,
} from "./types";
import { cleanInput, type CleanBill, type CleanEvent } from "./validate";

/** Thrown only when there is nothing to plan from (no usable "today"). Message is plain English. */
export class EngineInputError extends Error {
  override name = "EngineInputError";
}

// Funding order, top to bottom. Shortages are cut from the bottom up.
const KIND_ORDER: readonly BucketKind[] = ["carry", "rent", "emi", "bill", "card", "yearly", "living", "buffer", "goal", "hold", "spending"];
const NEED_KINDS: ReadonlySet<BucketKind> = new Set(["carry", "rent", "emi", "bill", "card", "yearly", "living"]);

interface Work extends Bucket {
  priority: number;
  unitAmount: number; // one payment of the bill
  paid: number; // bill_paid this cycle
  yearly?: { nextDue: ISODate; monthsLeft: number; remaining: number; dueThisCycle: boolean };
  goal?: { remaining: number; monthsLeft: number; neededPerMonth: number };
  livingDays?: number; // set when a budget only covers the days after a mid-cycle balance
  prepaid: number; // paid from the previous cycle before a late salary
}

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const sameName = (a: string, b: string) => normalise(a) === normalise(b);
const sum = (events: CleanEvent[]) => events.reduce((total, e) => total + e.amount, 0);
const byTime = (a: CleanEvent, b: CleanEvent) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order);

function inferKind(bill: CleanBill): BillKind {
  if (bill.kind && !(bill.kind === "yearly" && bill.dueMonth === null)) return bill.kind;
  if (bill.frequency === "yearly") return "yearly";
  if (/credit\s*card/i.test(bill.name)) return "card";
  if (/\brent\b/i.test(bill.name)) return "rent";
  if (/\bemi\b|\bloan\b/i.test(bill.name)) return "emi";
  return bill.isVariable ? "living" : "bill";
}

function label(b: Bucket): string {
  if (b.kind === "spending") return "spending money";
  if (b.kind === "buffer") return "your emergency buffer";
  if (b.kind === "goal") return `your ${b.name} goal`;
  return b.name;
}

function joinWords(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function newBucket(id: string, name: string, kind: BucketKind, target: number, priority = 0): Work {
  return { id, name, kind, target, planned: 0, spent: 0, left: 0, dueDates: [], priority, unitAmount: 0, paid: 0, prepaid: 0 };
}

/** Overrides used by buildNextSalaryPlan to plan the coming cycle instead of this one. */
export interface NextCycleOptions {
  /** This cycle's buffer left minus its shortfall. Negative is paid first from the salary. */
  carryIn: number;
  /** When the salary lands (later than the pay date if it's late). */
  salaryDate: ISODate;
  /** Unpaid leave taken off the salary, cut from the bottom up like a short salary. */
  leave: { days: number; cut: number } | null;
  /** Bucket id -> amount already paid from this cycle's money (bills due before a late salary). */
  prepaid: ReadonlyMap<string, number>;
  /** Decisions made before the salary arrives, shown right after the carry-in. */
  leadDecisions: Decision[];
}

/** Bills due after this cycle ends but before a late salary arrives, held back from this cycle's spending money. */
export interface LateSalaryHold {
  amount: number;
  salaryDate: ISODate;
  bills: UpcomingBill[];
}

export function buildPlan(input: PlanInput, today: Date | ISODate): Plan {
  const plan = planCycle(input, today);
  // A late next salary means some of next cycle's bills fall on this cycle's money.
  const setup = prepareNextCycle(input, plan);
  const early = billsBeforeLateSalary(setup);
  const amount = early.reduce((t, u) => t + u.amount, 0);
  if (amount === 0) return plan;
  return planCycle(input, today, undefined, { amount, salaryDate: setup.salaryDate, bills: early });
}

export interface NextCycleSetup {
  payDate: ISODate;
  salaryDate: ISODate;
  late: boolean;
  warnings: string[];
  fullSalary: number;
  leaveDays: number;
  leaveCut: number;
  leave: { days: number; cut: number } | null;
  /** The coming cycle's input: no events, with this cycle's set-asides counted as saved. */
  nextInput: PlanInput;
  /** Plan the coming cycle from the day the salary lands. */
  planToday: ISODate;
}

/** Everything needed to plan the coming cycle, derived from this cycle's plan. */
export function prepareNextCycle(input: PlanInput, current: Plan): NextCycleSetup {
  const clean = cleanInput(input);
  const { profile, settings } = clean;
  const fmt = (d: ISODate) => formatDate(d, current.today);

  const payDate = current.cycle.end;
  const nextCycle = payCycle(payDate, profile.payDay, settings.holidays);
  const warnings: string[] = [...clean.nextSalaryWarnings];

  // A late salary still belongs to the coming cycle, so it can't land on or after the following pay date.
  let salaryDate = payDate;
  if (profile.nextSalaryDate && profile.nextSalaryDate > payDate) {
    salaryDate = profile.nextSalaryDate < nextCycle.end ? profile.nextSalaryDate : addDays(nextCycle.end, -1);
    if (salaryDate !== profile.nextSalaryDate) {
      warnings.push(`Your late salary date is after the following payday, so ${fmt(salaryDate)} is used.`);
    }
  }

  const leaveDays = profile.unpaidLeaveDays;
  const leaveCut = Math.min(profile.salaryAmount, Math.round((profile.salaryAmount * leaveDays) / 30));

  // What this cycle puts aside is still there next cycle: yearly set-asides and goal money.
  // Spending money is assumed spent; the buffer comes across as part of the carry-in.
  const now = new Map(current.buckets.map((b) => [b.id, b]));
  const bills = clean.bills.map((b) => {
    const bucket = now.get(`bill:${b.id}`);
    // Due this cycle means it gets paid this cycle, so next year's starts again from nothing.
    const setAsideSoFar =
      bucket?.kind === "yearly" ? (bucket.dueDates.length > 0 ? 0 : b.setAsideSoFar + bucket.target) : b.setAsideSoFar;
    return { ...b, setAsideSoFar };
  });
  const goals = clean.goals.map((g) => ({ ...g, savedAmount: g.savedAmount + (now.get(`goal:${g.id}`)?.left ?? 0) }));

  return {
    payDate,
    salaryDate,
    late: salaryDate > payDate,
    warnings,
    fullSalary: profile.salaryAmount,
    leaveDays,
    leaveCut,
    leave: leaveCut > 0 ? { days: leaveDays, cut: leaveCut } : null,
    nextInput: {
      profile: { salaryAmount: profile.salaryAmount, payDay: profile.payDay, currentBalance: 0 },
      bills,
      incomes: clean.incomes,
      goals,
      events: [],
      settings,
    },
    planToday: salaryDate,
  };
}

/** The coming cycle's bills due between the normal pay date and a late salary. Empty when the salary is on time. */
export function billsBeforeLateSalary(setup: NextCycleSetup): UpcomingBill[] {
  if (!setup.late) return [];
  const provisional = planCycle(setup.nextInput, setup.planToday, {
    carryIn: 0,
    salaryDate: setup.salaryDate,
    leave: setup.leave,
    prepaid: new Map(),
    leadDecisions: [],
  });
  return provisional.upcomingBills.filter((u) => u.dueDate >= setup.payDate && u.dueDate < setup.salaryDate);
}

export function planCycle(input: PlanInput, today: Date | ISODate, next?: NextCycleOptions, hold?: LateSalaryHold): Plan {
  const todayISO = typeof today === "string" || today instanceof Date ? toIndiaDate(today) : null;
  if (!todayISO) throw new EngineInputError("Today's date is not a valid date, so no plan could be made.");

  const clean = cleanInput(input);
  const { profile, settings } = clean;
  const warnings = [...clean.warnings];
  const fmt = (d: ISODate) => formatDate(d, todayISO);

  const incomeDecisions: Decision[] = [];
  const reserveDecisions: Decision[] = [];
  const cutDecisions: Decision[] = [];
  const spendDecisions: Decision[] = [];
  const decide = (into: Decision[], kind: DecisionKind, amount: number, from: string, to: string, sentence: string) => {
    if (amount > 0) into.push({ kind, amount, from, to, sentence });
  };

  // ---- The cycle -------------------------------------------------------------
  const cycle = payCycle(todayISO, profile.payDay, settings.holidays);
  const inCycle = (d: ISODate) => d >= cycle.start && d < cycle.end;

  // ---- Starting point -----------------------------------------------------------
  // A balance taken inside this cycle already includes this cycle's salary and every bill and
  // event before it, so the plan only looks at what happens after it. A balance from before this
  // cycle is out of date and is left out rather than guessed forward.
  // The next cycle starts from the carry-in, not from a balance.
  const balance = next
    ? null
    : profile.balanceAsOf
    ? profile.balanceAsOf.date > todayISO
      ? { date: todayISO, at: null }
      : profile.balanceAsOf
    : null;
  const anchor = balance && balance.date >= cycle.start ? balance.date : null;
  const staleBalance = balance !== null && anchor === null;
  const afterBalance = (e: CleanEvent) =>
    anchor === null ||
    e.date > anchor ||
    (e.date === anchor && (balance!.at === null || e.createdAt === null || e.createdAt > balance!.at));
  const counted = (e: CleanEvent) => inCycle(e.date) && afterBalance(e);

  /** Due dates for a day-of-month inside this cycle, split into after the balance and on/before it. */
  const allOccurrences = (day: number): ISODate[] => {
    const out: ISODate[] = [];
    const startYm = yearMonthOf(cycle.start);
    for (let k = 0; k < 3; k++) {
      const ym = addMonths(startYm.year, startYm.month, k);
      const d = clampDueDate(ym.year, ym.month, day);
      if (inCycle(d)) out.push(d);
    }
    return out;
  };
  const occurrences = (day: number) => allOccurrences(day).filter((d) => anchor === null || d > anchor);
  const coveredByBalance = (day: number) => allOccurrences(day).filter((d) => anchor !== null && d <= anchor);

  /** Paydays from this cycle's onwards that land before `limit` (or on it, if inclusive). This cycle counts as 1. */
  const paydaysUntil = (limit: ISODate, inclusive: boolean): number => {
    let count = 0;
    for (let k = 0; k < 1200; k++) {
      const ym = addMonths(cycle.startYear, cycle.startMonth, k);
      const pay = actualPayDate(ym.year, ym.month, profile.payDay, settings.holidays);
      if (inclusive ? pay > limit : pay >= limit) break;
      count++;
    }
    return count;
  };

  const events = [...clean.events].sort(byTime);
  const cycleEvents = events.filter(counted);

  // ---- Money in --------------------------------------------------------------
  const openingBalance = next ? Math.max(0, next.carryIn) : staleBalance ? 0 : profile.currentBalance;
  if (next) {
    decide(incomeDecisions, "count_income", openingBalance, "balance", "available",
      `Carried over the ${rs(openingBalance)} left in this month's emergency buffer.`);
  } else if (staleBalance) {
    warnings.push(
      `Your balance of ${rs(profile.currentBalance)} is from ${fmt(balance!.date)}, before this pay cycle, so it wasn't counted. Update "Money in your account right now" in My details.`,
    );
  } else if (anchor) {
    decide(incomeDecisions, "count_income", openingBalance, "balance", "available",
      `Counted the ${rs(openingBalance)} in your account on ${fmt(anchor)}.`);
  } else {
    decide(incomeDecisions, "count_income", openingBalance, "balance", "available",
      `Counted the ${rs(openingBalance)} you already had in your account.`);
  }

  const salaryEvents = cycleEvents.filter((e) => e.type === "salary_received");
  const salaryReceived = salaryEvents.length > 0;
  // This cycle's pay date is its start, so a balance taken inside the cycle already holds the salary.
  const salaryInBalance = anchor !== null;
  const leave = next?.leave && next.leave.cut > 0 ? next.leave : null;
  const salary = next
    ? profile.salaryAmount - (leave?.cut ?? 0)
    : salaryReceived ? sum(salaryEvents) : salaryInBalance ? 0 : profile.salaryAmount;
  const salaryGap = next
    ? leave?.cut ?? 0
    : salaryReceived && !salaryInBalance ? Math.max(0, profile.salaryAmount - salary) : 0;
  const leaveWords = leave ? `${leave.days} unpaid leave day${leave.days === 1 ? "" : "s"}` : "";
  if (salaryInBalance) {
    decide(incomeDecisions, "skip_income", profile.salaryAmount, "salary", "none",
      `Did not add your ${rs(profile.salaryAmount)} salary from ${fmt(cycle.start)} again: it is already in the balance you entered on ${fmt(anchor!)}.`);
  }
  decide(incomeDecisions, "count_income", salary, "salary", "available",
    next
      ? `Counted your ${rs(salary)} salary, due on ${fmt(next.salaryDate)}${leave ? ` (${rs(profile.salaryAmount)} minus ${rs(leave.cut)} for ${leaveWords})` : ""}.`
      : salaryReceived
      ? `Counted the ${rs(salary)} salary you received${salaryGap > 0 ? `, ${rs(salaryGap)} less than your usual ${rs(profile.salaryAmount)}` : ""}.`
      : `Counted your ${rs(salary)} salary, due on ${fmt(cycle.start)}.`);

  let income = 0;
  const expectedNotCounted: ExpectedIncome[] = [];
  const incomeEvents = cycleEvents.filter((e) => e.type === "income_received");
  for (const inc of clean.incomes) {
    if (incomeEvents.some((e) => sameName(e.note, inc.name))) continue; // counted from the event below
    if (inc.frequency !== "monthly") continue; // no month on file, so it can't be expected on a date
    for (const d of occurrences(inc.expectedDay)) {
      if (inc.isReliable) {
        income += inc.amount;
        decide(incomeDecisions, "count_income", inc.amount, "income", "available",
          `Counted ${rs(inc.amount)} from ${inc.name}, expected on ${fmt(d)}.`);
      } else {
        expectedNotCounted.push({
          name: inc.name,
          amount: inc.amount,
          expectedDate: d,
          text: `${inc.name}: ${rs(inc.amount)} expected on ${fmt(d)}, not counted until it arrives.`,
        });
        decide(incomeDecisions, "skip_income", inc.amount, "income", "none",
          `Did not count ${inc.name} (${rs(inc.amount)}) because it hasn't arrived yet.`);
      }
    }
  }
  for (const e of incomeEvents) {
    income += e.amount;
    decide(incomeDecisions, "count_income", e.amount, "income", "available",
      `Counted ${rs(e.amount)}${e.note ? ` from ${e.note}` : ""} that you received on ${fmt(e.date)}.`);
  }

  const available = openingBalance + salary + income;
  // What the plan would have had with the full salary. The difference is cut from the bottom up.
  const baseline = available + salaryGap;

  // ---- Buckets ---------------------------------------------------------------
  const billBuckets: Work[] = [];
  const matchedPayments = new Set<CleanEvent>();
  const cardBills = clean.bills.filter((b) => inferKind(b) === "card");
  if (cardBills.length > 1) {
    warnings.push(`You have ${cardBills.length} credit card bills; all card spends are counted against "${cardBills[0].name}".`);
  }

  for (const bill of clean.bills) {
    const kind = inferKind(bill);
    const payments = cycleEvents.filter((e) => e.type === "bill_paid" && sameName(e.note, bill.name));
    payments.forEach((e) => matchedPayments.add(e));
    const b = newBucket(`bill:${bill.id}`, bill.name, kind, 0, bill.priority);
    b.unitAmount = bill.amount;
    b.paid = sum(payments);

    const alreadyPaid = (dates: ISODate[]) => {
      for (const d of dates) {
        decide(incomeDecisions, "already_paid", bill.amount, b.id, "none",
          `Treated ${bill.name} (${rs(bill.amount)}, due ${fmt(d)}) as already paid, because it was due before you entered your balance on ${fmt(anchor!)}.`);
      }
    };

    if (kind === "yearly") {
      const dueMonth = bill.dueMonth ?? 1;
      // Due on or before the balance date counts as paid, so look for the next one after it.
      const from = anchor ? addDays(anchor, 1) : cycle.start;
      const { year } = yearMonthOf(from);
      let nextDue = clampDueDate(year, dueMonth, bill.dueDay);
      if (nextDue < from) nextDue = clampDueDate(year + 1, dueMonth, bill.dueDay);
      const prevDue = clampDueDate(yearMonthOf(nextDue).year - 1, dueMonth, bill.dueDay);
      if (anchor && prevDue >= cycle.start) alreadyPaid([prevDue]);
      // Payments not counted as this cycle's spending (before the cycle, or inside the balance) still reduce what's owed.
      const paidEarlier = sum(
        events.filter(
          (e) => e.type === "bill_paid" && sameName(e.note, bill.name) && e.date > prevDue && e.date < cycle.end && !counted(e),
        ),
      );
      const remaining = Math.max(0, bill.amount - bill.setAsideSoFar - paidEarlier);
      const dueThisCycle = nextDue < cycle.end;
      const monthsLeft = dueThisCycle ? 1 : Math.max(1, paydaysUntil(nextDue, true));
      b.target = Math.ceil(remaining / monthsLeft);
      b.dueDates = dueThisCycle ? [nextDue] : [];
      b.yearly = { nextDue, monthsLeft, remaining, dueThisCycle };
    } else if (kind === "living") {
      // A budget for the whole cycle, not a dated payment. From a mid-cycle balance, only the days left need it.
      if (anchor) {
        b.livingDays = daysBetween(anchor, cycle.end);
        b.target = Math.ceil((bill.amount * b.livingDays) / daysBetween(cycle.start, cycle.end));
      } else b.target = bill.amount;
    } else if (kind === "card") {
      b.dueDates = occurrences(bill.dueDay);
      if (bill === cardBills[0]) {
        const allPayments = events.filter((e) => e.type === "bill_paid" && sameName(e.note, bill.name));
        const last = allPayments[allPayments.length - 1];
        // A card due date on or before the balance counts as paid; card spends are still owed whenever they happened.
        const impliedPaidOn = coveredByBalance(bill.dueDay).at(-1);
        const unpaidSpends = sum(
          events.filter(
            (e) => e.type === "card_spend" && (!last || byTime(e, last) > 0) && (!impliedPaidOn || e.date > impliedPaidOn),
          ),
        );
        b.target = b.paid + unpaidSpends;
      }
    } else {
      alreadyPaid(coveredByBalance(bill.dueDay));
      b.dueDates = occurrences(bill.dueDay);
      b.target = bill.amount * b.dueDates.length;
    }
    // Paid from last cycle's money before a late salary: this salary doesn't need to cover it.
    b.prepaid = Math.min(next?.prepaid.get(b.id) ?? 0, b.target);
    b.target -= b.prepaid;
    // A bill you've actually paid needed at least that much.
    b.target = Math.max(b.target, b.paid);
    billBuckets.push(b);
  }

  if (cardBills.length === 0) {
    const spends = sum(cycleEvents.filter((e) => e.type === "card_spend"));
    if (spends > 0) {
      warnings.push("You logged card spends but have no credit card bill. Add one so payments can be tracked.");
      billBuckets.push(newBucket("card", "Credit card", "card", spends));
    }
  }

  billBuckets.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.priority - b.priority);

  const buffer = newBucket("buffer", "Emergency buffer", "buffer", settings.emergencyBuffer);

  const goalBuckets: Work[] = [...clean.goals]
    .sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0))
    .map((g) => {
      const remaining = Math.max(0, g.targetAmount - g.savedAmount);
      const monthsLeft = paydaysUntil(g.deadline, false);
      const neededPerMonth = remaining === 0 ? 0 : Math.ceil(remaining / Math.max(1, monthsLeft));
      const b = newBucket(`goal:${g.id}`, g.name, "goal", neededPerMonth);
      b.goal = { remaining, monthsLeft, neededPerMonth };
      return b;
    });

  const spending = newBucket("spending", "Spending money", "spending", settings.spendingFloor);
  // Last month's shortfall is money already owed, so it comes before everything else.
  const carry = next && next.carryIn < 0 ? newBucket("carry", "Last month's shortfall", "carry", -next.carryIn) : null;
  const order: Work[] = [...(carry ? [carry] : []), ...billBuckets, buffer, ...goalBuckets, spending];
  const isNeed = (b: Work) => NEED_KINDS.has(b.kind);

  // ---- Allocate the full-salary baseline, top down -------------------------------
  let pool = baseline;
  for (const b of order) {
    if (b.kind === "spending") b.planned = pool;
    // Goals only get money beyond the spending floor.
    else if (b.kind === "goal") b.planned = Math.min(b.target, Math.max(0, pool - settings.spendingFloor));
    else b.planned = Math.min(b.target, pool);
    pool -= b.planned;
  }
  for (const b of order) {
    if (isNeed(b) && b.planned < b.target) {
      decide(cutDecisions, "shortfall", b.target - b.planned, "available", b.id,
        `Could only set aside ${rs(b.planned)} of the ${rs(b.target)} needed for ${label(b)} because your bills add up to more than your money this month.`);
    }
  }

  // ---- Salary came in short: cut from the bottom up -----------------------------------
  if (salaryGap > 0) {
    const reason = leave ? `because of ${leaveWords}` : `because your salary was ${rs(salaryGap)} short`;
    const protects = order.filter((b) => b.planned > 0).map((b) => ({ b, amount: b.planned }));
    const cuts: { b: Work; amount: number }[] = [];
    let toCut = salaryGap;
    for (const b of [...order].reverse()) {
      const take = Math.min(b.planned, toCut);
      if (take > 0) {
        b.planned -= take;
        toCut -= take;
        cuts.push({ b, amount: take });
      }
    }
    // Pair each cut with the highest bucket it keeps funded. Once the two meet, the rest is genuinely unfunded.
    const unfunded = new Map<Work, number>();
    let i = 0;
    for (const cut of cuts) {
      let rest = cut.amount;
      while (rest > 0 && i < protects.length) {
        const p = protects[i];
        const amount = Math.min(rest, p.amount);
        if (order.indexOf(cut.b) > order.indexOf(p.b)) {
          decide(cutDecisions, "cut", amount, cut.b.id, p.b.id,
            `Moved ${rs(amount)} from ${label(cut.b)} to ${label(p.b)} ${reason}.`);
        } else {
          unfunded.set(cut.b, (unfunded.get(cut.b) ?? 0) + amount);
        }
        rest -= amount;
        p.amount -= amount;
        if (p.amount === 0) i++;
      }
    }
    for (const [b, amount] of unfunded) {
      decide(cutDecisions, isNeed(b) ? "shortfall" : "cut", amount, b.id, "none",
        isNeed(b) ? `Could not set aside ${rs(amount)} for ${label(b)} ${reason}.` : `Cut ${rs(amount)} from ${label(b)} ${reason}.`);
    }
    // Unpaid leave opens with one summary line for the first (lowest-priority) cut.
    const first = cuts[0];
    if (leave && first && !unfunded.has(first.b)) {
      for (let k = cutDecisions.length - 1; k >= 0; k--) {
        if (cutDecisions[k].kind === "cut" && cutDecisions[k].from === first.b.id) cutDecisions.splice(k, 1);
      }
      cutDecisions.unshift({
        kind: "cut",
        amount: first.amount,
        from: first.b.id,
        to: "salary",
        sentence: `Your salary will be ${rs(leave.cut)} less because of ${leaveWords}, so I cut ${rs(first.amount)} from ${label(first.b)} first.`,
      });
    }
  }

  // ---- Late next salary: keep spending money back for bills due before it lands -----------
  // Taken before expenses are drawn, so a logged expense can't use money promised to those bills.
  if (hold) {
    const take = Math.min(spending.planned, hold.amount);
    if (take > 0) {
      const held = newBucket("hold", "Kept for bills before late salary", "hold", hold.amount);
      held.planned = take;
      spending.planned -= take;
      order.splice(order.indexOf(spending), 0, held);
    }
  }

  // ---- What was set aside ----------------------------------------------------------
  for (const b of order) {
    let sentence: string;
    if (b.kind === "carry") sentence = `${rs(b.planned)} of this salary covers last month's shortfall.`;
    else if (b.kind === "hold" && hold) {
      const names = joinWords([...new Set(hold.bills.map((x) => x.name))]);
      const dates = joinWords([...new Set(hold.bills.map((x) => fmt(x.dueDate)))]);
      sentence =
        b.planned >= b.target
          ? `Kept ${rs(b.planned)} of this month's spending money for ${names} (due ${dates}), because your salary comes on ${fmt(hold.salaryDate)}.`
          : `Kept ${rs(b.planned)} of this month's spending money towards the ${rs(b.target)} for ${names} (due ${dates}), because your salary comes on ${fmt(hold.salaryDate)}.`;
    }
    else if (b.kind === "spending") sentence = `Left ${rs(b.planned)} as spending money until payday on ${fmt(cycle.end)}.`;
    else if (b.kind === "buffer") sentence = `Kept ${rs(b.planned)} as your emergency buffer.`;
    else if (b.kind === "goal") sentence = `Put ${rs(b.planned)} towards your ${b.name} goal.`;
    else if (b.kind === "living") {
      sentence = b.livingDays
        ? `Set aside ${rs(b.planned)} for ${b.name} for the ${b.livingDays} days until payday.`
        : `Set aside ${rs(b.planned)} for ${b.name}.`;
    }
    else if (b.kind === "card") {
      sentence = `Set aside ${rs(b.planned)} for your ${b.name} bill${b.dueDates.length ? `, due ${fmt(b.dueDates[0])},` : ""} to cover your card spends.`;
    } else if (b.yearly && !b.yearly.dueThisCycle) {
      sentence = `Set aside ${rs(b.planned)} towards ${b.name} (${rs(b.yearly.remaining)} due ${fmt(b.yearly.nextDue)}, split over ${b.yearly.monthsLeft} paydays).`;
    } else if (b.dueDates.length === 0) sentence = `Set aside ${rs(b.planned)} for ${b.name}.`;
    else sentence = `Set aside ${rs(b.planned)} for ${b.name}, due ${joinWords(b.dueDates.map(fmt))}.`;
    decide(reserveDecisions, "reserve", b.planned, "available", b.id, sentence);
  }

  // ---- Money out ------------------------------------------------------------------
  const outflowsTotal = sum(cycleEvents.filter((e) => e.type === "bill_paid" || e.type === "expense"));
  let paidBeyondPlan = 0;
  for (const b of billBuckets) {
    b.spent = Math.min(b.paid, b.planned);
    // Paying more than could be set aside is already counted as unfunded need, so it isn't drawn again.
    paidBeyondPlan += b.paid - b.spent;
  }

  const outflows: { amount: number; what: string; date: ISODate }[] = [];
  for (const e of cycleEvents) {
    if (e.type === "expense") {
      outflows.push({ amount: e.amount, what: `${rs(e.amount)} expense${e.note ? ` (${e.note})` : ""}`, date: e.date });
    } else if (e.type === "bill_paid" && !matchedPayments.has(e)) {
      warnings.push(`A bill payment of ${rs(e.amount)}${e.note ? ` ("${e.note}")` : ""} didn't match any bill, so it was treated as an expense.`);
      outflows.push({ amount: e.amount, what: `${rs(e.amount)} payment${e.note ? ` (${e.note})` : ""}`, date: e.date });
    }
  }

  // Expenses come out of spending, then the buffer, then goals, then groceries. Never bill money.
  const drawOrder: Work[] = [
    spending,
    buffer,
    ...[...goalBuckets].reverse(),
    ...billBuckets.filter((b) => b.kind === "living").reverse(),
  ];
  const protectedNames = billBuckets.filter((b) => b.kind === "rent" || b.kind === "emi").map((b) => b.name);
  const untouched = protectedNames.length ? `${joinWords(protectedNames)} money was not touched.` : "Bill money was not touched.";
  let uncovered = 0;
  for (const o of outflows) {
    let rest = o.amount;
    for (const b of drawOrder) {
      const take = Math.min(b.planned - b.spent, rest);
      if (take > 0) {
        b.spent += take;
        rest -= take;
        decide(spendDecisions, "cover_expense", take, b.id, "expense",
          `Used ${rs(take)} of ${label(b)} for your ${o.what} on ${fmt(o.date)}.`);
      }
    }
    if (rest > 0) {
      uncovered += rest;
      const sentence = `Your ${o.what} on ${fmt(o.date)} was ${rs(rest)} more than your spare money. ${untouched}`;
      decide(spendDecisions, "shortfall", rest, "expense", "none", sentence);
      warnings.push(`${sentence} You need ${rs(rest)} more before payday on ${fmt(cycle.end)}.`);
    }
  }

  for (const b of order) b.left = b.planned - b.spent;

  // ---- Summary --------------------------------------------------------------------
  const unfundedNeeds = order.filter(isNeed).reduce((t, b) => t + (b.target - b.planned), 0);
  const shortfall = unfundedNeeds + uncovered;
  if (unfundedNeeds > 0) {
    const names = order.filter((b) => isNeed(b) && b.planned < b.target).map((b) => b.name);
    warnings.push(
      `You're ${rs(unfundedNeeds)} short before payday on ${fmt(cycle.end)}: ${joinWords(names)} ${names.length > 1 ? "aren't" : "isn't"} fully covered.`,
    );
  }
  const daysLeft = Math.max(1, daysBetween(todayISO, cycle.end));
  const safeToSpendToday = Math.max(0, Math.floor(spending.left / daysLeft));

  const upcomingBills: UpcomingBill[] = [];
  for (const b of billBuckets) {
    if (b.kind === "living") continue;
    const reserved = b.planned >= b.target;
    if (b.kind === "card") {
      // Past this cycle's due date: overdue if nothing was paid, otherwise new spends roll to next statement.
      const due = b.dueDates.find((d) => d >= todayISO) ?? (b.paid === 0 ? b.dueDates[b.dueDates.length - 1] : undefined);
      const owed = b.target - b.paid;
      if (due && owed > 0) upcomingBills.push({ billId: b.id, name: b.name, amount: owed, dueDate: due, reserved, overdue: due < todayISO });
      continue;
    }
    let paidLeft = b.paid + b.prepaid;
    for (const due of b.dueDates) {
      const each = b.yearly ? b.target : b.unitAmount;
      const covered = Math.min(paidLeft, each);
      paidLeft -= covered;
      if (each - covered > 0) {
        upcomingBills.push({ billId: b.id, name: b.name, amount: each - covered, dueDate: due, reserved, overdue: due < todayISO });
      }
    }
  }
  upcomingBills.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

  const status: Plan["status"] =
    shortfall > 0 ? "short" : buffer.left < buffer.target || spending.planned < settings.spendingFloor ? "tight" : "okay";
  const headline =
    status === "short"
      ? `Short by ${rs(shortfall)}`
      : status === "tight"
        ? `Tight this month: ${rs(spending.left)} to spend until payday`
        : "You're okay this month";

  let nextAction: string;
  if (shortfall > 0) {
    const unreserved = upcomingBills.find((u) => !u.reserved);
    const living = billBuckets.find((b) => b.kind === "living" && b.planned < b.target);
    const nextBill = upcomingBills.find((u) => !u.overdue);
    if (unreserved?.overdue) nextAction = `Find ${rs(shortfall)} more now: ${unreserved.name} was due on ${fmt(unreserved.dueDate)}.`;
    else if (unreserved) nextAction = `Find ${rs(shortfall)} more before ${fmt(unreserved.dueDate)} so ${unreserved.name} can be paid in full.`;
    else if (living) nextAction = `Find ${rs(shortfall)} more before payday on ${fmt(cycle.end)} to cover ${living.name}.`;
    else if (nextBill) nextAction = `Find ${rs(shortfall)} more before ${fmt(nextBill.dueDate)} so ${nextBill.name} can be paid in full.`;
    else nextAction = `Find ${rs(shortfall)} more before payday on ${fmt(cycle.end)}.`;
  } else if (upcomingBills.length > 0) {
    const next = upcomingBills[0];
    nextAction = next.overdue
      ? `${next.name} (${rs(next.amount)}) was due on ${fmt(next.dueDate)}. The money is set aside, so pay it today.`
      : `Next bill: ${next.name}, ${rs(next.amount)} on ${fmt(next.dueDate)}. The money is set aside.`;
  } else {
    nextAction = `No more bills before payday on ${fmt(cycle.end)}. You can spend up to ${rs(safeToSpendToday)} a day.`;
  }

  const goalStatus: GoalStatus[] = goalBuckets.map((b) => {
    const g = b.goal!;
    const canSpare = b.left;
    const onTrack = g.remaining === 0 || canSpare >= g.neededPerMonth;
    return {
      goalId: b.id.slice("goal:".length),
      name: b.name,
      remaining: g.remaining,
      monthsLeft: g.monthsLeft,
      neededPerMonth: g.neededPerMonth,
      canSpare,
      onTrack,
      text: onTrack ? "on track" : `needs ${rs(g.neededPerMonth)}/month, you can spare ${rs(canSpare)}`,
    };
  });

  return {
    today: todayISO,
    cycle: { start: cycle.start, end: cycle.end, daysLeft },
    money: {
      openingBalance,
      balanceAsOf: balance?.date ?? null,
      salaryInBalance,
      salary,
      salaryExpected: profile.salaryAmount,
      salaryReceived,
      income,
      available,
    },
    expectedNotCounted,
    status,
    headline,
    nextAction,
    safeToSpendToday,
    buckets: order.map(({ id, name, kind, target, planned, spent, left, dueDates }) => ({
      id, name, kind, target, planned, spent, left, dueDates,
    })),
    upcomingBills,
    goalStatus,
    // For the next salary, covering last month's shortfall is the first thing that happens.
    decisions: [
      ...reserveDecisions.filter((d) => d.to === "carry"),
      ...(next?.leadDecisions ?? []),
      ...incomeDecisions,
      ...reserveDecisions.filter((d) => d.to !== "carry"),
      ...cutDecisions,
      ...spendDecisions,
    ],
    shortfall,
    shortfallParts: { unfundedNeeds, uncoveredSpending: uncovered },
    outflows: { total: outflowsTotal, uncovered, paidBeyondPlan },
    warnings,
  };
}

/** Never throws. Use from API routes. */
export function safeBuildPlan(
  input: unknown,
  today: unknown,
): { ok: true; plan: Plan } | { ok: false; error: string } {
  try {
    return { ok: true, plan: buildPlan(input as PlanInput, today as Date | ISODate) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof EngineInputError ? err.message : "Something went wrong working out your plan.",
    };
  }
}
