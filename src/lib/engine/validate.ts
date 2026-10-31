import { DEFAULT_HOLIDAYS, parseISODate, toIndiaDate, type Holiday, type ISODate } from "./dates";
import { formatRupees } from "./format";
import type { BillKind, EventType } from "./types";

// Turns whatever the caller passed into clean values. Nothing here throws:
// bad values become safe defaults or are skipped, each with a plain-English warning.

export const DEFAULT_EMERGENCY_BUFFER = 2000;
export const DEFAULT_SPENDING_FLOOR = 3000;

export interface CleanBill {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
  frequency: "monthly" | "yearly";
  dueMonth: number | null;
  priority: number;
  isVariable: boolean;
  kind?: BillKind;
  setAsideSoFar: number;
}

export interface CleanIncome {
  id: string;
  name: string;
  amount: number;
  expectedDay: number;
  frequency: "monthly" | "yearly" | "oneoff";
  isReliable: boolean;
}

export interface CleanGoal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  deadline: ISODate;
}

export interface CleanEvent {
  type: EventType;
  amount: number;
  note: string;
  date: ISODate;
  order: number;
}

export interface CleanInput {
  profile: { salaryAmount: number; payDay: number; currentBalance: number };
  bills: CleanBill[];
  incomes: CleanIncome[];
  goals: CleanGoal[];
  events: CleanEvent[];
  settings: { emergencyBuffer: number; spendingFloor: number; holidays: Holiday[] };
  warnings: string[];
}

const BILL_KINDS: readonly string[] = ["rent", "emi", "bill", "card", "yearly", "living"];
const EVENT_TYPES: readonly string[] = ["salary_received", "card_spend", "expense", "income_received", "bill_paid"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;

/** A whole, non-negative number of rupees, or null (with a warning) if unusable. Fractions are rounded. */
function money(value: unknown, label: string, warnings: string[]): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    warnings.push(`${label} is not a valid amount.`);
    return null;
  }
  if (value < 0) {
    warnings.push(`${label} can't be negative (got ${formatRupees(value)}).`);
    return null;
  }
  if (!Number.isInteger(value)) {
    const rounded = Math.round(value);
    warnings.push(`${label} was rounded to ${formatRupees(rounded)}; amounts are whole rupees.`);
    return rounded;
  }
  return value;
}

/** A day of the month 1-31. Out-of-range numbers are pulled into range; non-numbers use `fallback`. */
function dayOfMonth(value: unknown, label: string, fallback: number, warnings: string[]): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    warnings.push(`${label} must be a day between 1 and 31. Using ${fallback}.`);
    return fallback;
  }
  const day = Math.min(31, Math.max(1, Math.round(value)));
  if (day !== value) warnings.push(`${label} must be a day between 1 and 31. Using ${day}.`);
  return day;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function list(value: unknown, label: string, warnings: string[]): unknown[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  warnings.push(`${label} should be a list; it was ignored.`);
  return [];
}

function date(value: unknown): ISODate | null {
  return typeof value === "string" || value instanceof Date ? toIndiaDate(value) : null;
}

export function cleanInput(raw: unknown): CleanInput {
  const warnings: string[] = [];
  const input: Obj = isObj(raw) ? raw : {};
  const p: Obj = isObj(input.profile) ? input.profile : {};
  if (!isObj(input.profile)) warnings.push("No profile was given, so salary and balance are treated as ₹0.");

  const salaryAmount = money(p.salaryAmount, "Your salary", warnings) ?? 0;
  if (salaryAmount === 0) {
    warnings.push("Your salary is ₹0, so only your balance and money you've received are counted.");
  }
  const payDay = dayOfMonth(p.payDay, "Your pay day", 1, warnings);
  const currentBalance = money(p.currentBalance, "Your current balance", warnings) ?? 0;

  const bills: CleanBill[] = [];
  list(input.bills, "Bills", warnings).forEach((b, i) => {
    if (!isObj(b)) return warnings.push(`Bill ${i + 1} was not readable and was skipped.`);
    const name = text(b.name, `Bill ${i + 1}`);
    const amount = money(b.amount, `The amount for "${name}"`, warnings);
    if (amount === null) return warnings.push(`"${name}" was skipped.`);
    const frequency = b.frequency === "yearly" ? "yearly" : "monthly";
    if (b.frequency !== "monthly" && b.frequency !== "yearly") {
      warnings.push(`"${name}" has no valid frequency, so it is treated as monthly.`);
    }
    let dueMonth: number | null = null;
    if (frequency === "yearly") {
      const m = b.dueMonth;
      if (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > 12) {
        return warnings.push(`"${name}" is yearly but has no valid due month (1-12), so it was skipped.`);
      }
      dueMonth = m;
    }
    const setAside = b.setAsideSoFar === undefined ? 0 : money(b.setAsideSoFar, `Money set aside for "${name}"`, warnings) ?? 0;
    bills.push({
      id: text(b.id, `bill-${i + 1}`),
      name,
      amount,
      dueDay: dayOfMonth(b.dueDay, `The due day for "${name}"`, 1, warnings),
      frequency,
      dueMonth,
      priority: typeof b.priority === "number" && Number.isFinite(b.priority) ? b.priority : 99,
      isVariable: b.isVariable === true,
      kind: typeof b.kind === "string" && BILL_KINDS.includes(b.kind) ? (b.kind as BillKind) : undefined,
      setAsideSoFar: setAside,
    });
  });
  if (bills.length === 0) warnings.push("You haven't added any bills yet.");

  const incomes: CleanIncome[] = [];
  list(input.incomes, "Incomes", warnings).forEach((x, i) => {
    if (!isObj(x)) return warnings.push(`Income ${i + 1} was not readable and was skipped.`);
    const name = text(x.name, `Income ${i + 1}`);
    const amount = money(x.amount, `The amount for "${name}"`, warnings);
    if (amount === null) return warnings.push(`"${name}" was skipped.`);
    const frequency = x.frequency === "monthly" || x.frequency === "yearly" ? x.frequency : "oneoff";
    incomes.push({
      id: text(x.id, `income-${i + 1}`),
      name,
      amount,
      expectedDay: dayOfMonth(x.expectedDay, `The expected day for "${name}"`, 1, warnings),
      frequency,
      // Unknown means not reliable: never count money that might not come.
      isReliable: x.isReliable === true,
    });
  });

  const goals: CleanGoal[] = [];
  list(input.goals, "Goals", warnings).forEach((g, i) => {
    if (!isObj(g)) return warnings.push(`Goal ${i + 1} was not readable and was skipped.`);
    const name = text(g.name, `Goal ${i + 1}`);
    const targetAmount = money(g.targetAmount, `The target for "${name}"`, warnings);
    const deadline = date(g.deadline);
    if (targetAmount === null) return warnings.push(`"${name}" was skipped.`);
    if (!deadline) return warnings.push(`"${name}" has no valid deadline, so it was skipped.`);
    goals.push({
      id: text(g.id, `goal-${i + 1}`),
      name,
      targetAmount,
      savedAmount: money(g.savedAmount, `The saved amount for "${name}"`, warnings) ?? 0,
      deadline,
    });
  });

  const events: CleanEvent[] = [];
  list(input.events, "Events", warnings).forEach((e, i) => {
    if (!isObj(e)) return warnings.push(`Entry ${i + 1} in your log was not readable and was skipped.`);
    if (typeof e.type !== "string" || !EVENT_TYPES.includes(e.type)) {
      return warnings.push(`Entry ${i + 1} in your log has an unknown type and was skipped.`);
    }
    const amount = money(e.amount, `Entry ${i + 1} in your log`, warnings);
    const d = date(e.date);
    if (amount === null) return warnings.push(`Entry ${i + 1} in your log was skipped.`);
    if (!d) return warnings.push(`Entry ${i + 1} in your log has no valid date and was skipped.`);
    events.push({ type: e.type as EventType, amount, note: typeof e.note === "string" ? e.note.trim() : "", date: d, order: i });
  });

  const s: Obj = isObj(input.settings) ? input.settings : {};
  const emergencyBuffer =
    s.emergencyBuffer === undefined ? DEFAULT_EMERGENCY_BUFFER : money(s.emergencyBuffer, "The emergency buffer", warnings) ?? DEFAULT_EMERGENCY_BUFFER;
  const spendingFloor =
    s.spendingFloor === undefined ? DEFAULT_SPENDING_FLOOR : money(s.spendingFloor, "The spending floor", warnings) ?? DEFAULT_SPENDING_FLOOR;
  const holidays = Array.isArray(s.holidays)
    ? (s.holidays as unknown[]).filter(
        (h): h is Holiday =>
          (typeof h === "string" && parseISODate(h) !== null) ||
          (isObj(h) && typeof h.month === "number" && typeof h.day === "number"),
      )
    : DEFAULT_HOLIDAYS;

  return {
    profile: { salaryAmount, payDay, currentBalance },
    bills,
    incomes,
    goals,
    events,
    settings: { emergencyBuffer, spendingFloor, holidays },
    warnings,
  };
}
