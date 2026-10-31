import { parseISODate, type ISODate } from "./dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Indian digit grouping: ₹45,000, ₹1,20,000, ₹1,00,00,000. */
export function formatRupees(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const digits = String(Math.abs(Math.trunc(amount)));
  if (digits.length <= 3) return `${sign}₹${digits}`;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${sign}₹${rest},${lastThree}`;
}

/** "1 Dec", or "15 Feb 2027" when the year differs from `relativeTo`'s year. */
export function formatDate(date: ISODate, relativeTo?: ISODate): string {
  const p = parseISODate(date);
  if (!p) return date;
  const base = `${p.day} ${MONTHS[p.month - 1]}`;
  const sameYear = relativeTo !== undefined && parseISODate(relativeTo)?.year === p.year;
  return sameYear ? base : `${base} ${p.year}`;
}
