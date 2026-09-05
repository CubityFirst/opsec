import { and, asc, count, desc, eq, isNotNull, isNull, lte, sql, type SQL } from "drizzle-orm";
import { nextOccurrenceAfter } from "@shared/recurrence";
import type { ReminderListQuery, Repeat } from "@shared/schemas/reminder";
import type { ReminderListResult, ReminderOut } from "@shared/types";
import { schema, type Db } from "../db";
import type { ReminderRow } from "../db/schema";
import { ApiError } from "../lib/errors";
import { contactRefs } from "./contacts";

const { reminders } = schema;

/** Today's date as YYYY-MM-DD (UTC). Reminders are day-granular so the timezone edge is acceptable. */
export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function repeatOf(r: Pick<ReminderRow, "repeatEvery" | "repeatUnit" | "repeatUntil">): Repeat | null {
  if (!r.repeatEvery || !r.repeatUnit) return null;
  return { every: r.repeatEvery, unit: r.repeatUnit, until: r.repeatUntil };
}

/** Column values for a repeat rule (all null for a one-off). */
export function repeatColumns(repeat: Repeat | null | undefined): Pick<ReminderRow, "repeatEvery" | "repeatUnit" | "repeatUntil"> {
  return repeat ? { repeatEvery: repeat.every, repeatUnit: repeat.unit, repeatUntil: repeat.until ?? null } : { repeatEvery: null, repeatUnit: null, repeatUntil: null };
}

export function toReminderOut(r: ReminderRow, contact: ReminderOut["contact"]): ReminderOut {
  return {
    id: r.id,
    contact,
    title: r.title,
    notes: r.notes,
    dueOn: r.dueOn,
    repeat: repeatOf(r),
    status: r.completedAt ? "done" : "open",
    completedAt: r.completedAt,
    lastCompletedOn: r.lastCompletedOn,
    completedCount: r.completedCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function getReminderRow(db: Db, id: string): Promise<ReminderRow> {
  const row = await db.select().from(reminders).where(eq(reminders.id, id)).get();
  if (!row) throw ApiError.notFound("Reminder");
  return row;
}

async function hydrate(db: Db, rows: ReminderRow[]): Promise<ReminderOut[]> {
  const ids = [...new Set(rows.flatMap((r) => (r.contactId ? [r.contactId] : [])))];
  const refs = ids.length ? await contactRefs(db, ids) : new Map();
  return rows.map((r) => toReminderOut(r, r.contactId ? (refs.get(r.contactId) ?? null) : null));
}

export async function getReminderOut(db: Db, id: string): Promise<ReminderOut> {
  const [out] = await hydrate(db, [await getReminderRow(db, id)]);
  return out!;
}

/**
 * The due day after `after` for a recurring reminder, or null once the series
 * has run past its `until`. One-offs have no next occurrence.
 */
export function nextDueOn(r: Pick<ReminderRow, "startOn" | "repeatEvery" | "repeatUnit" | "repeatUntil">, after: string): string | null {
  const repeat = repeatOf(r);
  if (!repeat) return null;
  return nextOccurrenceAfter(r.startOn, repeat, after);
}

/** Open first (soonest due on top), then done ones most recently finished first. */
const ORDER = [
  sql`case when ${reminders.completedAt} is null then 0 else 1 end`,
  sql`case when ${reminders.completedAt} is null then ${reminders.dueOn} end asc`,
  desc(reminders.completedAt),
  desc(reminders.id),
];

/** Reminders filtered by contact, status and (for open ones) a due-by day, with open/done counts over the same contact filter. */
export async function listReminders(db: Db, q: ReminderListQuery): Promise<ReminderListResult> {
  const where: SQL[] = [];
  if (q.contactId) where.push(eq(reminders.contactId, q.contactId));
  const countsWhere = where.length ? and(...where) : undefined;
  if (q.status === "open") where.push(isNull(reminders.completedAt));
  if (q.status === "done") where.push(isNotNull(reminders.completedAt));
  if (q.dueBy) where.push(isNull(reminders.completedAt), lte(reminders.dueOn, q.dueBy));
  const cond = where.length ? and(...where) : undefined;
  const doneFlag = sql<number>`case when ${reminders.completedAt} is null then 0 else 1 end`;
  const [rows, [total], countRows] = await Promise.all([
    db
      .select()
      .from(reminders)
      .where(cond)
      .orderBy(...(q.dueBy ? [asc(reminders.dueOn), asc(reminders.id)] : ORDER))
      .limit(q.limit)
      .offset(q.offset),
    db.select({ n: count() }).from(reminders).where(cond),
    db.select({ done: doneFlag, n: count() }).from(reminders).where(countsWhere).groupBy(doneFlag),
  ]);
  const counts = { open: 0, done: 0 };
  for (const r of countRows) {
    if (Number(r.done) === 1) counts.done = r.n;
    else counts.open = r.n;
  }
  return { items: await hydrate(db, rows), total: total?.n ?? 0, counts };
}
