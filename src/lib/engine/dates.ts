// Calendar dates are plain "YYYY-MM-DD" strings in India time (Asia/Kolkata).
// All arithmetic goes through UTC day numbers, so the machine's own timezone
// never shifts a date. ISO strings also compare correctly with < and >.

export type ISODate = string;

/** A holiday that repeats every year ({ month, day }) or a one-off "YYYY-MM-DD". */
export type Holiday = { month: number; day: number; name?: string } | ISODate;

// Edit this list to match your employer's calendar. Pongal is included for Chennai.
export const DEFAULT_HOLIDAYS: Holiday[] = [
  { month: 1, day: 15, name: "Pongal" },
  { month: 1, day: 26, name: "Republic Day" },
  { month: 8, day: 15, name: "Independence Day" },
  { month: 10, day: 2, name: "Gandhi Jayanti" },
  { month: 12, day: 25, name: "Christmas" },
];

export const INDIA_TIMEZONE = "Asia/Kolkata";

const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function toDayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function fromDayNumber(dayNumber: number): ISODate {
  const d = new Date(dayNumber * DAY_MS);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function parseISODate(value: string): { year: number; month: number; day: number } | null {
  const m = ISO_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function parts(date: ISODate) {
  const p = parseISODate(date);
  if (!p) throw new Error(`Not a valid date: ${date}`);
  return p;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Normalises month overflow, e.g. (2026, 13) -> (2027, 1). */
export function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + n;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function addDays(date: ISODate, n: number): ISODate {
  const { year, month, day } = parts(date);
  return fromDayNumber(toDayNumber(year, month, day) + n);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: ISODate, to: ISODate): number {
  const a = parts(from);
  const b = parts(to);
  return toDayNumber(b.year, b.month, b.day) - toDayNumber(a.year, a.month, a.day);
}

/** A due day that doesn't exist in the month falls on its last day (31 Feb -> 28 or 29 Feb). */
export function clampDueDate(year: number, month: number, day: number): ISODate {
  const safeDay = Math.min(Math.max(1, Math.trunc(day)), daysInMonth(year, month));
  return `${pad(year, 4)}-${pad(month)}-${pad(safeDay)}`;
}

function isHoliday(date: ISODate, holidays: readonly Holiday[]): boolean {
  const { month, day } = parts(date);
  return holidays.some((h) => (typeof h === "string" ? h === date : h.month === month && h.day === day));
}

export function isWorkingDay(date: ISODate, holidays: readonly Holiday[] = DEFAULT_HOLIDAYS): boolean {
  const { year, month, day } = parts(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday, 6 = Saturday
  return weekday !== 0 && weekday !== 6 && !isHoliday(date, holidays);
}

/** Pay day for the month, moved forward past weekends and holidays to the next working day. */
export function actualPayDate(
  year: number,
  month: number,
  payDay: number,
  holidays: readonly Holiday[] = DEFAULT_HOLIDAYS,
): ISODate {
  let date = clampDueDate(year, month, payDay);
  // Bounded so a holiday list covering every day can't loop forever.
  for (let i = 0; i < 31 && !isWorkingDay(date, holidays); i++) date = addDays(date, 1);
  return date;
}

/**
 * The India calendar date for a Date (an instant) or a date string. A database
 * DATE column arrives as UTC midnight, which is 05:30 the same day in India, so
 * it keeps its day. Returns null for anything unparseable.
 */
export function toIndiaDate(value: Date | string): ISODate | null {
  if (typeof value === "string") {
    if (ISO_RE.test(value)) return parseISODate(value) ? value : null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : toIndiaDate(parsed);
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function yearMonthOf(date: ISODate): { year: number; month: number } {
  const { year, month } = parts(date);
  return { year, month };
}

/** The pay cycle containing `today`: from the latest actual pay date on or before today up to (not including) the next one. */
export function payCycle(
  today: ISODate,
  payDay: number,
  holidays: readonly Holiday[] = DEFAULT_HOLIDAYS,
): { start: ISODate; end: ISODate; startYear: number; startMonth: number } {
  const { year, month } = yearMonthOf(today);
  // A pay date pushed past a month end can land in the next month, so look back up to two months.
  for (let k = 0; k >= -2; k--) {
    const ym = addMonths(year, month, k);
    const start = actualPayDate(ym.year, ym.month, payDay, holidays);
    if (start <= today) {
      const next = addMonths(ym.year, ym.month, 1);
      return { start, end: actualPayDate(next.year, next.month, payDay, holidays), startYear: ym.year, startMonth: ym.month };
    }
  }
  // Unreachable: a pay date can only be pushed a few days, never two whole months.
  throw new Error(`Could not find the pay cycle for ${today}.`);
}
