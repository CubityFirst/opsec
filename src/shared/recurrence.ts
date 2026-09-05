/**
 * Day-granular recurrence maths shared by the Worker and the SPA. Days are
 * YYYY-MM-DD strings compared lexically; all arithmetic is done in UTC so the
 * runtime's timezone never shifts a date.
 */
import type { Repeat } from "./schemas/reminder";

const DAY_MS = 86_400_000;

function parse(day: string): { y: number; m: number; d: number } {
  const [y, m, d] = day.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

function toUtc(day: string): number {
  const { y, m, d } = parse(day);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Days between two YYYY-MM-DD days (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** Add whole calendar days. */
export function addDays(day: string, n: number): string {
  return fromUtc(toUtc(day) + n * DAY_MS);
}

/** Add whole months, clamping the day to the target month (31 Jan + 1 → 28/29 Feb). */
export function addMonths(day: string, n: number): string {
  const { y, m, d } = parse(day);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = total - ty * 12; // 0-based
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(ty, tm, Math.min(d, last)));
}

/**
 * Occurrence number `n` (0 = the anchor day) of a schedule. Month and year
 * schedules are always computed from the anchor, so a reminder anchored on the
 * 31st falls on the 31st whenever the month has one instead of drifting to the
 * 28th for good after February.
 */
export function nthOccurrence(startOn: string, repeat: Repeat, n: number): string {
  const step = repeat.every * n;
  switch (repeat.unit) {
    case "day":
      return addDays(startOn, step);
    case "week":
      return addDays(startOn, step * 7);
    case "month":
      return addMonths(startOn, step);
    case "year":
      return addMonths(startOn, step * 12);
  }
}

/**
 * The first occurrence strictly after `after`, or null when the schedule has
 * run out (`until` passed). `after` before the anchor yields the anchor itself.
 */
export function nextOccurrenceAfter(startOn: string, repeat: Repeat, after: string): string | null {
  let n: number;
  if (after < startOn) n = 0;
  else if (repeat.unit === "day" || repeat.unit === "week") {
    const stepDays = repeat.every * (repeat.unit === "week" ? 7 : 1);
    n = Math.floor(daysBetween(startOn, after) / stepDays) + 1;
  } else {
    const a = parse(startOn);
    const b = parse(after);
    const months = (b.y - a.y) * 12 + (b.m - a.m);
    const stepMonths = repeat.every * (repeat.unit === "year" ? 12 : 1);
    // Clamping can put occurrence k on or before `after` even when the month
    // arithmetic says otherwise, so start one step early and walk forward.
    n = Math.max(0, Math.floor(months / stepMonths) - 1);
  }
  let candidate = nthOccurrence(startOn, repeat, n);
  while (candidate <= after) candidate = nthOccurrence(startOn, repeat, ++n);
  if (repeat.until && candidate > repeat.until) return null;
  return candidate;
}
