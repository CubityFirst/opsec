import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { parsePartialDate, type ContactKind, type InteractionType } from "@shared/schemas/common";

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "no data";
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return format(d, "d MMM yyyy, HH:mm");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return format(d, "d MMM yyyy");
}

export interface BirthdayParts {
  year: number | null;
  month: number | null;
  day: number | null;
}

/** Parse a partial date (`YYYY-MM-DD`, `YYYY-MM`, `YYYY`, `--MM-DD`, `--MM`); null when empty or malformed. */
export function parseBirthday(value: string | null | undefined): BirthdayParts | null {
  if (!value) return null;
  return parsePartialDate(value);
}

/** Compose the stored form from parts; empty string when nothing is known. A day without a month is dropped. */
export function composeBirthday(parts: { year?: number | null; month?: number | null; day?: number | null }): string {
  const year = parts.year ? String(parts.year).padStart(4, "0") : null;
  const month = parts.month ? String(parts.month).padStart(2, "0") : null;
  const day = month && parts.day ? String(parts.day).padStart(2, "0") : null;
  if (year && month && day) return `${year}-${month}-${day}`;
  if (year && month) return `${year}-${month}`;
  if (year) return year;
  if (month && day) return `--${month}-${day}`;
  if (month) return `--${month}`;
  return "";
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Human form of a partial date: "14 May 1988 (38)", "May 1988 (~38)",
 * "1988 (~38)", "14 May", "May". The age is exact only for a full date.
 */
export function formatBirthday(value: string | null | undefined, now = new Date()): string {
  const p = parseBirthday(value);
  if (!p) return value ?? "";
  const parts: string[] = [];
  if (p.day && p.month) parts.push(String(p.day));
  if (p.month) parts.push(MONTH_SHORT[p.month - 1]!);
  if (p.year) parts.push(String(p.year));
  let text = parts.join(" ");
  if (p.year) {
    let age = now.getFullYear() - p.year;
    const exact = !!(p.month && p.day);
    if (exact && (now.getMonth() + 1 < p.month! || (now.getMonth() + 1 === p.month && now.getDate() < p.day!))) age -= 1;
    if (age >= 0) text += exact ? ` (${age})` : ` (~${age})`;
  }
  return text;
}

/** ISO datetime → value for an <input type="datetime-local"> (local time). */
export function toDateTimeLocal(iso: string | null | undefined): string {
  const d = iso ? parseISO(iso) : new Date();
  if (!isValid(d)) return "";
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/** <input type="datetime-local"> value (local) → ISO UTC string. */
export function fromDateTimeLocal(value: string): string {
  const d = new Date(value);
  return isValid(d) ? d.toISOString() : new Date().toISOString();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export const KIND_LABELS: Record<ContactKind, string> = {
  person: "Person",
  pet: "Pet",
  organization: "Organisation",
};

export const INTERACTION_LABELS: Record<InteractionType, string> = {
  call: "Call",
  text: "Text",
  email: "Email",
  meeting: "Meeting",
  meal: "Meal",
  gift: "Gift",
  event: "Event",
  note: "Note",
  other: "Other",
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}
