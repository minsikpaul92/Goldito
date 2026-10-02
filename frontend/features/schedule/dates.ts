/**
 * Calendar dates as `YYYY-MM-DD` strings in the app timezone (D8, America/Toronto).
 * Arithmetic runs on UTC midnights so the device timezone never shifts a day.
 */

export const APP_TIMEZONE = "America/Toronto";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toUtc(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's date in the app timezone. */
export function appToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(day: string, n: number): string {
  const date = toUtc(day);
  date.setUTCDate(date.getUTCDate() + n);
  return fromUtc(date);
}

/** First day of the month `n` months after the month of `day`. */
export function addMonths(day: string, n: number): string {
  const date = toUtc(day);
  return fromUtc(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1)));
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function monthEnd(day: string): string {
  return addDays(addMonths(day, 1), -1);
}

/** Inclusive day count, e.g. Oct 5 → Oct 8 = 4. */
export function daySpan(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000) + 1;
}

/** Weeks (Sunday first) for a month view; days outside the month are null. */
export function monthGrid(month: string): (string | null)[][] {
  const first = monthStart(month);
  const last = monthEnd(month);
  const lead = toUtc(first).getUTCDay();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = first; day <= last; day = addDays(day, 1)) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function dayOfMonth(day: string): number {
  return Number(day.slice(8, 10));
}

/** "October 2026" */
export function formatMonth(day: string): string {
  return `${MONTHS_LONG[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
}

/** "Oct 5" */
export function formatDay(day: string): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${dayOfMonth(day)}`;
}

/** "Oct 5", "Oct 5–8", "Oct 30 – Nov 2" (same style as fmt_date_range in 003). */
export function formatDayRange(from: string, to: string): string {
  if (from === to) return formatDay(from);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${formatDay(from)}–${dayOfMonth(to)}`;
  return `${formatDay(from)} – ${formatDay(to)}`;
}

/** "HH:MM" or Postgres "HH:MM:SS" → "8:00 AM" (DESIGN.md §7.6). */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "HH:MM:SS" → "HH:MM" */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

/** Minutes since midnight for "HH:MM". */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** "HH:MM" `step` minutes later or earlier, wrapping around midnight. */
export function shiftTime(time: string, step: number): string {
  const total = (((timeToMinutes(time) + step) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
