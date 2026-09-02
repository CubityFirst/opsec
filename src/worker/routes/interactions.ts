import { zValidator } from "@hono/zod-validator";
import { and, count, desc, eq, gte, inArray, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { interactionCreateSchema, interactionListQuerySchema, interactionUpdateSchema } from "@shared/schemas/interaction";
import { paginationSchema } from "@shared/schemas/common";
import { extractMentionIds } from "@shared/mentions";
import type { InteractionOut, ListResult } from "@shared/types";
import { schema } from "../db";
import type { AppEnv } from "../env";
import { runBatch, type Stmt } from "../lib/batch";
import { ApiError, validationHook } from "../lib/errors";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";
import { activityInserts, diffChanges, event } from "../services/activity";
import { contactRefs, getContactRow } from "../services/contacts";
import { deleteObjects } from "../services/files";
import { getInteractionOut, getInteractionRow, hydrateInteractions, listContactInteractions, participantIds } from "../services/interactions";

const { contacts, interactions, interactionContacts, files } = schema;

const app = new Hono<AppEnv>();

app.get("/contacts/:id/interactions", zValidator("query", paginationSchema, validationHook), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const { limit, offset } = c.req.valid("query");
  await getContactRow(db, id);
  return c.json(await listContactInteractions(db, id, { limit, offset }));
});

app.get("/interactions", zValidator("query", interactionListQuerySchema, validationHook), async (c) => {
  const db = c.get("db");
  const q = c.req.valid("query");
  const conditions: SQL[] = [];
  if (q.since) conditions.push(gte(interactions.occurredAt, q.since));
  if (q.type) conditions.push(eq(interactions.type, q.type));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(interactions).where(where),
    db.select().from(interactions).where(where).orderBy(desc(interactions.occurredAt), desc(interactions.id)).limit(q.limit).offset(q.offset),
  ]);
  const result: ListResult<InteractionOut> = { items: await hydrateInteractions(db, rows), total };
  return c.json(result);
});

app.post("/interactions", zValidator("json", interactionCreateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const input = c.req.valid("json");
  const ids = [...new Set(input.contactIds)];
  const refs = await contactRefs(db, ids);
  const missing = ids.filter((id) => !refs.has(id));
  if (missing.length > 0) throw ApiError.badRequest(`Unknown contact id(s): ${missing.join(", ")}`);

  const id = newId();
  const now = nowIso();
  const mentioned = await existingMentions(db, input.body, ids);
  await runBatch(db, [
    db.insert(interactions).values({
      id,
      type: input.type,
      occurredAt: input.occurredAt,
      summary: input.summary,
      body: input.body ?? null,
      location: input.location ?? null,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(interactionContacts).values(ids.map((contactId) => ({ interactionId: id, contactId, role: null }))),
    db.update(contacts).set({ updatedAt: now }).where(inArray(contacts.id, ids)),
    ...activityInserts(
      db,
      [
        ...ids.map((contactId) =>
          event(contactId, "interaction", id, "interaction.created", {
            v: 1,
            type: input.type,
            occurredAt: input.occurredAt,
            summary: input.summary,
            participantIds: ids,
          }),
        ),
        ...mentioned.map((contactId) =>
          event(contactId, "interaction", id, "interaction.mentioned", {
            v: 1,
            type: input.type,
            occurredAt: input.occurredAt,
            summary: input.summary,
            participantIds: ids,
          }),
        ),
      ],
      c.get("actor"),
    ),
  ]);
  return c.json(await getInteractionOut(db, id), 201);
});

/** Mentioned contact ids that exist and are not already participants. */
async function existingMentions(db: AppEnv["Variables"]["db"], body: string | null | undefined, participantIds: string[]): Promise<string[]> {
  const ids = extractMentionIds(body).filter((x) => !participantIds.includes(x));
  if (ids.length === 0) return [];
  const refs = await contactRefs(db, ids);
  return ids.filter((x) => refs.has(x));
}

app.get("/interactions/:id", async (c) => {
  return c.json(await getInteractionOut(c.get("db"), c.req.param("id")));
});

app.patch("/interactions/:id", zValidator("json", interactionUpdateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const before = await getInteractionRow(db, id);
  const patch = c.req.valid("json");
  const current = await participantIds(db, id);

  const fieldChanges = diffChanges(
    { type: before.type, occurredAt: before.occurredAt, summary: before.summary, body: before.body, location: before.location },
    { type: patch.type, occurredAt: patch.occurredAt, summary: patch.summary, body: patch.body, location: patch.location },
  );
  const wanted = patch.contactIds ? [...new Set(patch.contactIds)] : current;
  const toAdd = wanted.filter((x) => !current.includes(x));
  const toRemove = current.filter((x) => !wanted.includes(x));
  if (toAdd.length > 0) {
    const refs = await contactRefs(db, toAdd);
    const missing = toAdd.filter((x) => !refs.has(x));
    if (missing.length > 0) throw ApiError.badRequest(`Unknown contact id(s): ${missing.join(", ")}`);
  }
  const changes = { ...fieldChanges };
  if (toAdd.length > 0 || toRemove.length > 0) changes.participantIds = { from: current, to: wanted };
  if (Object.keys(changes).length === 0) return c.json(await getInteractionOut(db, id));

  const now = nowIso();
  const summary = patch.summary ?? before.summary;
  const stmts: Stmt[] = [
    db
      .update(interactions)
      .set({
        type: patch.type ?? before.type,
        occurredAt: patch.occurredAt ?? before.occurredAt,
        summary,
        body: patch.body === undefined ? before.body : patch.body,
        location: patch.location === undefined ? before.location : patch.location,
        updatedAt: now,
      })
      .where(eq(interactions.id, id)),
  ];
  if (toAdd.length > 0) stmts.push(db.insert(interactionContacts).values(toAdd.map((contactId) => ({ interactionId: id, contactId, role: null }))));
  if (toRemove.length > 0) {
    stmts.push(db.delete(interactionContacts).where(and(eq(interactionContacts.interactionId, id), inArray(interactionContacts.contactId, toRemove))));
  }
  const affected = [...new Set([...current, ...wanted])];
  stmts.push(db.update(contacts).set({ updatedAt: now }).where(inArray(contacts.id, affected)));
  // Contacts newly mentioned in the details get a "mentioned" entry on their feed.
  const previouslyMentioned = new Set(extractMentionIds(before.body));
  const newBody = patch.body === undefined ? before.body : patch.body;
  const newlyMentioned = (await existingMentions(db, newBody, wanted)).filter((x) => !previouslyMentioned.has(x));
  stmts.push(
    ...activityInserts(
      db,
      [
        ...affected.map((contactId) => event(contactId, "interaction", id, "interaction.updated", { v: 1, summary, changes })),
        ...newlyMentioned.map((contactId) =>
          event(contactId, "interaction", id, "interaction.mentioned", {
            v: 1,
            type: patch.type ?? before.type,
            occurredAt: patch.occurredAt ?? before.occurredAt,
            summary,
            participantIds: wanted,
          }),
        ),
      ],
      c.get("actor"),
    ),
  );
  await runBatch(db, stmts);
  return c.json(await getInteractionOut(db, id));
});

app.delete("/interactions/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const before = await getInteractionRow(db, id);
  const [participants, fileRows] = await Promise.all([
    participantIds(db, id),
    db.select({ r2Key: files.r2Key }).from(files).where(eq(files.interactionId, id)),
  ]);
  await deleteObjects(
    c.env.BUCKET,
    fileRows.map((f) => f.r2Key),
  );
  const stmts: Stmt[] = [db.delete(interactions).where(eq(interactions.id, id))];
  if (participants.length > 0) {
    stmts.push(
      ...activityInserts(
        db,
        participants.map((contactId) =>
          event(contactId, "interaction", id, "interaction.deleted", {
            v: 1,
            type: before.type,
            occurredAt: before.occurredAt,
            summary: before.summary,
          }),
        ),
        c.get("actor"),
      ),
    );
  }
  await runBatch(db, stmts);
  return c.body(null, 204);
});

export default app;
