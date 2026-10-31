import type { Holiday, ISODate } from "./dates";

// Input shapes match the Prisma rows structurally, so DB results can be passed straight in.
// All money is whole rupees.

export type BillKind = "rent" | "emi" | "bill" | "card" | "yearly" | "living";

export interface EngineProfile {
  salaryAmount: number;
  payDay: number;
  /** Money carried into this pay cycle, before this cycle's salary. */
  currentBalance: number;
}

export interface EngineBill {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  frequency: "monthly" | "yearly";
  dueMonth?: number | null;
  priority: number;
  isVariable: boolean;
  /** Overrides the kind guessed from name, frequency and isVariable. */
  kind?: BillKind;
  /** Yearly bills only: money already put aside towards the next payment, held outside currentBalance. */
  setAsideSoFar?: number;
}

export interface EngineIncome {
  id: string;
  name: string;
  amount: number;
  expectedDay: number;
  frequency: "monthly" | "yearly" | "oneoff";
  isReliable: boolean;
}

export interface EngineGoal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  deadline: Date | ISODate;
}

export type EventType = "salary_received" | "card_spend" | "expense" | "income_received" | "bill_paid";

export interface EngineEvent {
  id?: string;
  type: EventType;
  amount: number;
  /** For bill_paid and income_received: the bill or income name it belongs to. */
  note?: string | null;
  date: Date | ISODate;
}

export interface EngineSettings {
  emergencyBuffer?: number;
  /** Spending money kept back before anything goes to goals. */
  spendingFloor?: number;
  holidays?: Holiday[];
}

export interface PlanInput {
  profile: EngineProfile;
  bills: EngineBill[];
  incomes: EngineIncome[];
  goals: EngineGoal[];
  events: EngineEvent[];
  settings?: EngineSettings;
}

export type BucketKind = BillKind | "buffer" | "goal" | "spending";

export interface Bucket {
  id: string;
  name: string;
  kind: BucketKind;
  /** What this bucket needs this cycle. */
  target: number;
  /** Real money allocated to it. */
  planned: number;
  spent: number;
  left: number;
  dueDates: ISODate[];
}

export type DecisionKind = "count_income" | "skip_income" | "reserve" | "cut" | "cover_expense" | "shortfall";

export interface Decision {
  kind: DecisionKind;
  amount: number;
  /** Bucket id, or "salary" / "income" / "available" / "expense". */
  from: string;
  to: string;
  sentence: string;
}

export interface UpcomingBill {
  billId: string;
  name: string;
  amount: number;
  dueDate: ISODate;
  reserved: boolean;
  overdue: boolean;
}

export interface GoalStatus {
  goalId: string;
  name: string;
  remaining: number;
  monthsLeft: number;
  neededPerMonth: number;
  canSpare: number;
  onTrack: boolean;
  text: string;
}

export interface ExpectedIncome {
  name: string;
  amount: number;
  expectedDate: ISODate;
  text: string;
}

export interface Plan {
  today: ISODate;
  cycle: { start: ISODate; end: ISODate; daysLeft: number };
  money: {
    openingBalance: number;
    salary: number;
    salaryExpected: number;
    salaryReceived: boolean;
    income: number;
    available: number;
  };
  expectedNotCounted: ExpectedIncome[];
  status: "okay" | "tight" | "short";
  headline: string;
  nextAction: string;
  safeToSpendToday: number;
  buckets: Bucket[];
  upcomingBills: UpcomingBill[];
  goalStatus: GoalStatus[];
  decisions: Decision[];
  shortfall: number;
  shortfallParts: { unfundedNeeds: number; uncoveredSpending: number };
  /**
   * Money that left the account this cycle (bill payments + expenses).
   * uncovered: expenses no bucket could pay for (part of the shortfall).
   * paidBeyondPlan: bill payments above what could be set aside (already counted as unfunded need).
   */
  outflows: { total: number; uncovered: number; paidBeyondPlan: number };
  warnings: string[];
}
