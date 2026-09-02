import { zValidator } from "@hono/zod-validator";
import { and, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import type { ContactKind } from "@shared/schemas/common";
import { relationshipCreateSchema, relationshipUpdateSchema } from "@shared/schemas/relationship";
import type { ContactRef, RelationshipRowOut } from "@shared/types";
import { schema } from "../db";
import type { RelationshipRow } from "../db/schema";
import type { AppEnv } from "../env";
import { runBatch } from "../lib/batch";
import { ApiError, validationHook } from "../lib/errors";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";
import { activityInserts, diffChanges, event } from "../services/activity";
import { contactRefs, getContactRow } from "../services/contacts";
import { listRelationshipsFor } from "../services/relationships";
import { clearEmployerFieldStatement } from "../services/employment";
import { parseKinds } from "./relationship-types";

const { relationships, relationshipTypes } = schema;

const app = new Hono<AppEnv>();

function toRowOut(r: RelationshipRow): RelationshipRowOut {
  return {
    id: r.id,
    fromContactId: r.fromContactId,
    toContactId: r.toContactId,
    typeKey: r.typeKey,
    label: r.label,
    notes: r.notes,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function getRelationship(db: AppEnv["Variables"]["db"], id: string): Promise<RelationshipRow> {
  const row = await db.select().from(relationships).where(eq(relationships.id, id)).get();
  if (!row) throw ApiError.notFound("Relationship");
  return row;
}

async function getType(db: AppEnv["Variables"]["db"], key: string) {
  const inv = alias(relationshipTypes, "inv");
  const row = await db
    .select({
      key: relationshipTypes.key,
      label: relationshipTypes.label,
      category: relationshipTypes.category,
      fromKinds: relationshipTypes.fromKinds,
      toKinds: relationshipTypes.toKinds,
      inverseKey: inv.key,
      inverseLabel: inv.label,
    })
    .from(relationshipTypes)
    .innerJoin(inv, eq(inv.key, relationshipTypes.inverseKey))
    .where(eq(relationshipTypes.key, key))
    .get();
  if (!row) throw ApiError.badRequest(`Unknown relationship type "${key}"`);
  return row;
}

const KIND_WORD: Record<ContactKind, string> = { person: "a person", pet: "a pet", organization: "an organisation" };

/** "from is the <type> of to" only makes sense for the kinds the type allows on each end. */
function assertKindsFit(type: { key: string; label: string; fromKinds: string; toKinds: string }, from: ContactRef, to: ContactRef) {
  if (!parseKinds(type.fromKinds).includes(from.kind) || !parseKinds(type.toKinds).includes(to.kind)) {
    throw ApiError.badRequest(`"${type.label}" cannot link ${KIND_WORD[from.kind]} to ${KIND_WORD[to.kind]}`);
  }
}

app.get("/contacts/:id/relationships", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await getContactRow(db, id);
  const items = await listRelationshipsFor(db, id);
  return c.json({ items, total: items.length });
});

app.post("/relationships", zValidator("json", relationshipCreateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const input = c.req.valid("json");
  const [refs, type] = await Promise.all([contactRefs(db, [input.fromContactId, input.toContactId]), getType(db, input.typeKey)]);
  const from = refs.get(input.fromContactId);
  const to = refs.get(input.toContactId);
  if (!from) throw ApiError.badRequest("fromContactId does not exist");
  if (!to) throw ApiError.badRequest("toContactId does not exist");
  assertKindsFit(type, from, to);

  const dup = await db
    .select({ id: relationships.id })
    .from(relationships)
    .where(
      or(
        and(eq(relationships.fromContactId, from.id), eq(relationships.toContactId, to.id), eq(relationships.typeKey, type.key)),
        and(eq(relationships.fromContactId, to.id), eq(relationships.toContactId, from.id), eq(relationships.typeKey, type.inverseKey)),
      ),
    )
    .get();
  if (dup) throw ApiError.conflict("This relationship already exists");

  const now = nowIso();
  const row: RelationshipRow = {
    id: newId(),
    fromContactId: from.id,
    toContactId: to.id,
    typeKey: type.key,
    label: input.label ?? null,
    notes: input.notes ?? null,
    startedAt: input.startedAt ?? null,
    endedAt: input.endedAt ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await runBatch(db, [
    db.insert(relationships).values(row),
    ...activityInserts(
      db,
      [
        event(from.id, "relationship", row.id, "relationship.added", {
          v: 1,
          otherContactId: to.id,
          otherDisplayName: to.displayName,
          typeKey: type.inverseKey,
          typeLabel: type.inverseLabel,
          direction: "outgoing",
          label: row.label,
        }),
        event(to.id, "relationship", row.id, "relationship.added", {
          v: 1,
          otherContactId: from.id,
          otherDisplayName: from.displayName,
          typeKey: type.key,
          typeLabel: type.label,
          direction: "incoming",
          label: row.label,
        }),
      ],
      c.get("actor"),
    ),
  ]);
  return c.json(toRowOut(row), 201);
});

app.get("/relationships/:id", async (c) => {
  return c.json(toRowOut(await getRelationship(c.get("db"), c.req.param("id"))));
});

app.patch("/relationships/:id", zValidator("json", relationshipUpdateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const before = await getRelationship(db, c.req.param("id"));
  const patch = c.req.valid("json");
  const changes = diffChanges(
    { typeKey: before.typeKey, label: before.label, notes: before.notes, startedAt: before.startedAt, endedAt: before.endedAt },
    patch,
  );
  if (Object.keys(changes).length === 0) return c.json(toRowOut(before));
  const refs = await contactRefs(db, [before.fromContactId, before.toContactId]);
  const from = refs.get(before.fromContactId)!;
  const to = refs.get(before.toContactId)!;
  if (patch.typeKey) assertKindsFit(await getType(db, patch.typeKey), from, to);
  const now = nowIso();
  await runBatch(db, [
    db
      .update(relationships)
      .set({
        typeKey: patch.typeKey ?? before.typeKey,
        label: patch.label === undefined ? before.label : patch.label,
        notes: patch.notes === undefined ? before.notes : patch.notes,
        startedAt: patch.startedAt === undefined ? before.startedAt : patch.startedAt,
        endedAt: patch.endedAt === undefined ? before.endedAt : patch.endedAt,
        updatedAt: now,
      })
      .where(eq(relationships.id, before.id)),
    ...activityInserts(
      db,
      [
        event(from.id, "relationship", before.id, "relationship.updated", { v: 1, otherContactId: to.id, otherDisplayName: to.displayName, changes }),
        event(to.id, "relationship", before.id, "relationship.updated", { v: 1, otherContactId: from.id, otherDisplayName: from.displayName, changes }),
      ],
      c.get("actor"),
    ),
  ]);
  return c.json(toRowOut(await getRelationship(db, before.id)));
});

app.delete("/relationships/:id", async (c) => {
  const db = c.get("db");
  const before = await getRelationship(db, c.req.param("id"));
  const [refs, type] = await Promise.all([contactRefs(db, [before.fromContactId, before.toContactId]), getType(db, before.typeKey)]);
  const from = refs.get(before.fromContactId)!;
  const to = refs.get(before.toContactId)!;
  const clearEmployer = clearEmployerFieldStatement(db, before);
  await runBatch(db, [
    db.delete(relationships).where(eq(relationships.id, before.id)),
    ...(clearEmployer ? [clearEmployer] : []),
    ...activityInserts(
      db,
      [
        event(from.id, "relationship", before.id, "relationship.removed", {
          v: 1,
          otherContactId: to.id,
          otherDisplayName: to.displayName,
          typeKey: type.inverseKey,
          typeLabel: type.inverseLabel,
        }),
        event(to.id, "relationship", before.id, "relationship.removed", {
          v: 1,
          otherContactId: from.id,
          otherDisplayName: from.displayName,
          typeKey: type.key,
          typeLabel: type.label,
        }),
      ],
      c.get("actor"),
    ),
  ]);
  return c.body(null, 204);
});

export default app;
