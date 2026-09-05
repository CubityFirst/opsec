import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { describeRepeat, reminderCreateSchema, reminderListQuerySchema, reminderUpdateSchema, type Repeat } from "@shared/schemas/reminder";
import type { ReminderListResult } from "@shared/types";
import { schema, type Db } from "../db";
import type { ReminderRow } from "../db/schema";
import type { AppEnv } from "../env";
import { runBatch, type Stmt } from "../lib/batch";
import { ApiError, validationHook } from "../lib/errors";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";
import { activityInserts, diffChanges, event, type AnyActivityInput } from "../services/activity";
import { contactRefs, getContactRow } from "../services/contacts";
import { getReminderOut, getReminderRow, listReminders, nextDueOn, repeatColumns, repeatOf, todayIso } from "../services/reminders";

const { reminders, contacts } = schema;

const app = new Hono<AppEnv>();

function checkRepeat(dueOn: string, repeat: Repeat | null | undefined) {
  if (repeat?.until && repeat.until < dueOn) throw ApiError.badRequest("The repeat end date must not be before the due date");
}

/**
 * Statements that stamp the contact and log an event against it. A reminder
 * with no contact has nowhere to log (the activity table is per contact), so
 * this returns nothing for it.
 */
function touch(db: Db, contactId: string | null, now: string, mkEvent: (contactId: string) => AnyActivityInput, actor: string): Stmt[] {
  if (!contactId) return [];
  return [db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, contactId)), ...activityInserts(db, [mkEvent(contactId)], actor)];
}

/** All reminders, open first; `?status=open|done`, `?dueBy=YYYY-MM-DD` for what has come due, `?contactId=`. */
app.get("/reminders", zValidator("query", reminderListQuerySchema, validationHook), async (c) => {
  const result: ReminderListResult = await listReminders(c.get("db"), c.req.valid("query"));
  return c.json(result);
});

app.get("/contacts/:id/reminders", zValidator("query", reminderListQuerySchema, validationHook), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await getContactRow(db, id);
  const result: ReminderListResult = await listReminders(db, { ...c.req.valid("query"), contactId: id });
  return c.json(result);
});

app.post("/reminders", zValidator("json", reminderCreateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const input = c.req.valid("json");
  const contactId = input.contactId ?? null;
  if (contactId) await getContactRow(db, contactId);
  checkRepeat(input.dueOn, input.repeat);
  const now = nowIso();
  const row: ReminderRow = {
    id: newId(),
    contactId,
    title: input.title,
    notes: input.notes ?? null,
    dueOn: input.dueOn,
    startOn: input.dueOn,
    ...repeatColumns(input.repeat),
    completedAt: null,
    lastCompletedOn: null,
    completedCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await runBatch(db, [
    db.insert(reminders).values(row),
    ...touch(db, contactId, now, (cid) => event(cid, "reminder", row.id, "reminder.created", { v: 1, title: row.title, dueOn: row.dueOn, repeat: input.repeat ? describeRepeat(input.repeat) : null }), c.get("actor")),
  ]);
  return c.json(await getReminderOut(db, row.id), 201);
});

app.get("/reminders/:id", async (c) => c.json(await getReminderOut(c.get("db"), c.req.param("id"))));

app.patch("/reminders/:id", zValidator("json", reminderUpdateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const before = await getReminderRow(db, c.req.param("id"));
  const patch = c.req.valid("json");
  const beforeRepeat = repeatOf(before);
  const next = {
    contactId: patch.contactId === undefined ? before.contactId : patch.contactId,
    title: patch.title ?? before.title,
    notes: patch.notes === undefined ? before.notes : patch.notes,
    dueOn: patch.dueOn ?? before.dueOn,
    repeat: patch.repeat === undefined ? beforeRepeat : patch.repeat,
  };
  if (next.contactId && next.contactId !== before.contactId) await getContactRow(db, next.contactId);
  checkRepeat(next.dueOn, next.repeat);
  const names = await contactRefs(db, [before.contactId, next.contactId].filter((x): x is string => !!x));
  const label = (id: string | null) => (id ? (names.get(id)?.displayName ?? id) : null);
  const changes = diffChanges(
    { contact: label(before.contactId), title: before.title, notes: before.notes, dueOn: before.dueOn, repeat: describeRepeat(beforeRepeat) },
    { contact: label(next.contactId), title: next.title, notes: next.notes, dueOn: next.dueOn, repeat: describeRepeat(next.repeat) },
  );
  if (Object.keys(changes).length === 0) return c.json(await getReminderOut(db, before.id));
  const now = nowIso();
  // A new due day or rule re-anchors the schedule on the new due day.
  const reanchor = next.dueOn !== before.dueOn || "repeat" in changes;
  const logs: Stmt[] = [];
  for (const cid of new Set([before.contactId, next.contactId])) {
    logs.push(...touch(db, cid, now, (id) => event(id, "reminder", before.id, "reminder.updated", { v: 1, title: next.title, changes }), c.get("actor")));
  }
  await runBatch(db, [
    db
      .update(reminders)
      .set({ contactId: next.contactId, title: next.title, notes: next.notes, dueOn: next.dueOn, startOn: reanchor ? next.dueOn : before.startOn, ...repeatColumns(next.repeat), updatedAt: now })
      .where(eq(reminders.id, before.id)),
    ...logs,
  ]);
  return c.json(await getReminderOut(db, before.id));
});

/**
 * Mark the current occurrence done (or skip it). A one-off is finished; a
 * recurring reminder moves on to the first occurrence after today (or after
 * its due day, if that is later), and is finished only once the series has run
 * past its end date.
 */
async function advance(c: Context<AppEnv>, kind: "completed" | "skipped") {
  const db = c.get("db");
  const before = await getReminderRow(db, c.req.param("id")!);
  if (before.completedAt) throw ApiError.conflict("This reminder is already done");
  const repeating = !!repeatOf(before);
  if (kind === "skipped" && !repeating) throw ApiError.conflict("Only a recurring reminder can be skipped; complete or delete a one-off");
  const now = nowIso();
  const today = todayIso();
  const next = repeating ? nextDueOn(before, before.dueOn > today ? before.dueOn : today) : null;
  const patch: Partial<ReminderRow> = { updatedAt: now };
  if (kind === "completed") {
    patch.lastCompletedOn = before.dueOn;
    patch.completedCount = before.completedCount + 1;
  }
  if (next) patch.dueOn = next;
  else patch.completedAt = now;
  await runBatch(db, [
    db.update(reminders).set(patch).where(eq(reminders.id, before.id)),
    ...touch(db, before.contactId, now, (cid) => event(cid, "reminder", before.id, `reminder.${kind}`, { v: 1, title: before.title, on: before.dueOn, nextDueOn: next }), c.get("actor")),
  ]);
  return c.json(await getReminderOut(db, before.id));
}

app.post("/reminders/:id/complete", (c) => advance(c, "completed"));
app.post("/reminders/:id/skip", (c) => advance(c, "skipped"));

/** Undo "done": a one-off becomes open on its due day again; an exhausted series reopens on its last occurrence. */
app.post("/reminders/:id/reopen", async (c) => {
  const db = c.get("db");
  const before = await getReminderRow(db, c.req.param("id"));
  if (!before.completedAt) throw ApiError.conflict("This reminder is still open");
  const now = nowIso();
  const patch: Partial<ReminderRow> = { completedAt: null, updatedAt: now };
  if (!repeatOf(before) && before.lastCompletedOn === before.dueOn) {
    patch.lastCompletedOn = null;
    patch.completedCount = Math.max(0, before.completedCount - 1);
  }
  await runBatch(db, [
    db.update(reminders).set(patch).where(eq(reminders.id, before.id)),
    ...touch(db, before.contactId, now, (cid) => event(cid, "reminder", before.id, "reminder.reopened", { v: 1, title: before.title, dueOn: before.dueOn }), c.get("actor")),
  ]);
  return c.json(await getReminderOut(db, before.id));
});

app.delete("/reminders/:id", async (c) => {
  const db = c.get("db");
  const before = await getReminderRow(db, c.req.param("id"));
  const repeat = repeatOf(before);
  await runBatch(db, [
    db.delete(reminders).where(eq(reminders.id, before.id)),
    ...touch(db, before.contactId, nowIso(), (cid) => event(cid, "reminder", before.id, "reminder.deleted", { v: 1, title: before.title, dueOn: before.dueOn, repeat: repeat ? describeRepeat(repeat) : null }), c.get("actor")),
  ]);
  return c.body(null, 204);
});

export default app;
