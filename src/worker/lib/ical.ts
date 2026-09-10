/**
 * Minimal iCalendar (RFC 5545) writer. Timed events are always emitted in UTC
 * (`…Z`), all-day events as floating dates, and every content line is folded at
 * 75 octets with CRLF endings as the spec requires.
 */
import type { Repeat } from "@shared/schemas/reminder";

export interface IcalEvent {
  /** Stable identifier so a client updates the event in place on each refresh. */
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  /** Timed event: ISO-8601 instant. */
  start?: string;
  /** End of a timed event; defaults to `start` + one hour. */
  end?: string;
  /** All-day event: YYYY-MM-DD. Exclusive with `start`. */
  day?: string;
  /** Recurrence rule, without the `RRULE:` prefix. */
  rrule?: string | null;
  /** Free-form categories, e.g. the source it came from. */
  categories?: string[];
}

const DAY_MS = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `20260910T143000Z` for an ISO instant. */
export function icalDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** `20260910` for a YYYY-MM-DD day. */
export function icalDate(day: string): string {
  return day.replace(/-/g, "");
}

function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!) + DAY_MS).toISOString().slice(0, 10);
}

/** Escape a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line so no line exceeds 75 octets; continuation lines start
 * with a single space. Splits on UTF-8 byte boundaries, never inside a code point.
 */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Back up to the start of a code point (a UTF-8 continuation byte is 10xxxxxx).
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    out.push((out.length ? " " : "") + new TextDecoder().decode(bytes.subarray(start, end)));
    start = end;
    limit = 74;
  }
  return out.join("\r\n");
}

/**
 * RRULE for a reminder repeat, anchored on `anchorDay` (YYYY-MM-DD, which must
 * itself be an occurrence). Month and year rules keep the app's semantics, where
 * an anchor on the 29th–31st falls on the last day of shorter months: the rule
 * lists both the wanted day and -1 (the last day) and takes the first, so a
 * month that has the day uses it and a shorter month falls back to its last day.
 */
export function repeatRule(repeat: Repeat, anchorDay: string): string {
  const [, m, d] = anchorDay.split("-").map(Number);
  const parts: string[] = [];
  const interval = repeat.every > 1 ? `;INTERVAL=${repeat.every}` : "";
  switch (repeat.unit) {
    case "day":
      parts.push(`FREQ=DAILY${interval}`);
      break;
    case "week":
      parts.push(`FREQ=WEEKLY${interval}`);
      break;
    case "month":
      parts.push(`FREQ=MONTHLY${interval}`, monthDayPart(d!));
      break;
    case "year":
      parts.push(`FREQ=YEARLY${interval}`, `BYMONTH=${m}`, monthDayPart(d!));
      break;
  }
  if (repeat.until) parts.push(`UNTIL=${icalDate(repeat.until)}`);
  return parts.join(";");
}

/** BYMONTHDAY clause for "the `day`th, or the last day when the month is shorter". */
export function monthDayPart(day: number): string {
  return day > 28 ? `BYMONTHDAY=${day},-1;BYSETPOS=1` : `BYMONTHDAY=${day}`;
}

/** Yearly rule for a birthday-style anniversary; 29 Feb falls on 28 Feb in common years. */
export function yearlyRule(month: number, day: number): string {
  return `FREQ=YEARLY;BYMONTH=${month};${monthDayPart(day)}`;
}

function prop(name: string, value: string | null | undefined): string[] {
  if (value === null || value === undefined || value === "") return [];
  return [`${name}:${escapeText(value)}`];
}

export function eventLines(e: IcalEvent, stamp: string): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`];
  if (e.day) {
    lines.push(`DTSTART;VALUE=DATE:${icalDate(e.day)}`, `DTEND;VALUE=DATE:${icalDate(nextDay(e.day))}`);
  } else if (e.start) {
    const end = e.end ?? new Date(Date.parse(e.start) + 3_600_000).toISOString();
    lines.push(`DTSTART:${icalDateTime(e.start)}`, `DTEND:${icalDateTime(end)}`);
  }
  if (e.rrule) lines.push(`RRULE:${e.rrule}`);
  lines.push(...prop("SUMMARY", e.summary), ...prop("DESCRIPTION", e.description), ...prop("LOCATION", e.location));
  // URL is a URI value, not TEXT: no escaping.
  if (e.url) lines.push(`URL:${e.url}`);
  if (e.categories?.length) lines.push(`CATEGORIES:${e.categories.map(escapeText).join(",")}`);
  lines.push("END:VEVENT");
  return lines;
}

export interface IcalCalendar {
  name: string;
  events: IcalEvent[];
  /** Instant written into every DTSTAMP; defaults to now. */
  now?: string;
}

/** Whole calendar document, CRLF-terminated. */
export function buildCalendar(cal: IcalCalendar): string {
  const stamp = icalDateTime(cal.now ?? new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//opsec//Calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(cal.name)}`,
    "X-WR-TIMEZONE:UTC",
  ];
  for (const e of cal.events) lines.push(...eventLines(e, stamp));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
