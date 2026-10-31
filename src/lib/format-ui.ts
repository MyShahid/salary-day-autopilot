import { parseISODate, type ISODate } from "@/lib/engine/dates";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon, 9 Nov", with the year added when it isn't the same year as `today`. */
export function formatDayDate(date: ISODate, today: ISODate): string {
  const p = parseISODate(date);
  if (!p) return date;
  const weekday = WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
  const sameYear = parseISODate(today)?.year === p.year;
  return `${weekday}, ${p.day} ${MONTHS[p.month - 1]}${sameYear ? "" : ` ${p.year}`}`;
}
