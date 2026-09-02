import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { lifeEventCreateSchema, lifeEventUpdateSchema } from "@shared/schemas/life-event";
import type { LifeEventOut, ListResult } from "@shared/types";
import { schema } from "../db";
import type { LifeEventRow } from "../db/schema";
import type { AppEnv } from "../env";
import { runBatch } from "../lib/batch";
import { ApiError, validationHook } from "../lib/errors";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";
import { activityInserts, diffChanges, event } from "../services/activity";
import { getContactRow } from "../services/contacts";
import { listLifeEvents, toLifeEventOut } from "../services/life-events";

const { lifeEvents, contacts } = schema;

const app = new Hono<AppEnv>();

async function getLifeEvent(db: AppEnv["Variables"]["db"], id: string): Promise<LifeEventRow> {
  const row = await db.select().from(lifeEvents).where(eq(lifeEvents.id, id)).get();
  if (!row) throw ApiError.notFound("Life event");
  return row;
}

app.get("/contacts/:id/life-events", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await getContactRow(db, id);
  const items = await listLifeEvents(db, id);
  const result: ListResult<LifeEventOut> = { items, total: items.length };
  return c.json(result);
});

app.post("/contacts/:id/life-events", zValidator("json", lifeEventCreateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const contactId = c.req.param("id");
  await getContactRow(db, contactId);
  const input = c.req.valid("json");
  const now = nowIso();
  const row: LifeEventRow = {
    id: newId(),
    contactId,
    category: input.category,
    title: input.title,
    occurredOn: input.occurredOn,
    body: input.body ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await runBatch(db, [
    db.insert(lifeEvents).values(row),
    db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, contactId)),
    ...activityInserts(
      db,
      [event(contactId, "life_event", row.id, "life_event.created", { v: 1, category: row.category, title: row.title, occurredOn: row.occurredOn })],
      c.get("actor"),
    ),
  ]);
  return c.json(toLifeEventOut(row), 201);
});

app.get("/life-events/:id", async (c) => {
  return c.json(toLifeEventOut(await getLifeEvent(c.get("db"), c.req.param("id"))));
});

app.patch("/life-events/:id", zValidator("json", lifeEventUpdateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const before = await getLifeEvent(db, c.req.param("id"));
  const patch = c.req.valid("json");
  const changes = diffChanges({ category: before.category, title: before.title, occurredOn: before.occurredOn, body: before.body }, patch);
  if (Object.keys(changes).length === 0) return c.json(toLifeEventOut(before));
  const now = nowIso();
  const title = patch.title ?? before.title;
  await runBatch(db, [
    db
      .update(lifeEvents)
      .set({
        category: patch.category ?? before.category,
        title,
        occurredOn: patch.occurredOn ?? before.occurredOn,
        body: patch.body === undefined ? before.body : patch.body,
        updatedAt: now,
      })
      .where(eq(lifeEvents.id, before.id)),
    db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, before.contactId)),
    ...activityInserts(db, [event(before.contactId, "life_event", before.id, "life_event.updated", { v: 1, title, changes })], c.get("actor")),
  ]);
  return c.json(toLifeEventOut(await getLifeEvent(db, before.id)));
});

app.delete("/life-events/:id", async (c) => {
  const db = c.get("db");
  const before = await getLifeEvent(db, c.req.param("id"));
  await runBatch(db, [
    db.delete(lifeEvents).where(eq(lifeEvents.id, before.id)),
    ...activityInserts(
      db,
      [event(before.contactId, "life_event", before.id, "life_event.deleted", { v: 1, category: before.category, title: before.title, occurredOn: before.occurredOn })],
      c.get("actor"),
    ),
  ]);
  return c.body(null, 204);
});

export default app;
