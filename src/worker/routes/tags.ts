import { zValidator } from "@hono/zod-validator";
import { asc, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { tagCreateSchema, tagUpdateSchema } from "@shared/schemas/tag";
import type { TagWithCount } from "@shared/types";
import { schema } from "../db";
import type { AppEnv } from "../env";
import { ApiError, validationHook } from "../lib/errors";
import { requireAdmin } from "../middleware/auth";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";
import { toTagOut } from "../services/contacts";

const { tags, contactTags } = schema;

const app = new Hono<AppEnv>();

app.get("/tags", async (c) => {
  const db = c.get("db");
  const rows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color, contactCount: count(contactTags.contactId) })
    .from(tags)
    .leftJoin(contactTags, eq(contactTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(asc(tags.nameLower));
  const items: TagWithCount[] = rows.map((r) => ({ id: r.id, name: r.name, color: r.color, contactCount: r.contactCount }));
  return c.json({ items, total: items.length });
});

app.post("/tags", zValidator("json", tagCreateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const input = c.req.valid("json");
  const existing = await db.select().from(tags).where(eq(tags.nameLower, input.name.toLowerCase())).get();
  if (existing) throw ApiError.conflict(`Tag "${existing.name}" already exists`);
  const now = nowIso();
  const row = { id: newId(), name: input.name, nameLower: input.name.toLowerCase(), color: input.color ?? null, createdAt: now, updatedAt: now };
  await db.insert(tags).values(row);
  return c.json(toTagOut(row), 201);
});

app.patch("/tags/:id", zValidator("json", tagUpdateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const before = await db.select().from(tags).where(eq(tags.id, id)).get();
  if (!before) throw ApiError.notFound("Tag");
  const patch = c.req.valid("json");
  const name = patch.name ?? before.name;
  if (name.toLowerCase() !== before.nameLower) {
    const clash = await db.select({ id: tags.id }).from(tags).where(eq(tags.nameLower, name.toLowerCase())).get();
    if (clash) throw ApiError.conflict(`Tag "${name}" already exists`);
  }
  await db
    .update(tags)
    .set({ name, nameLower: name.toLowerCase(), color: patch.color === undefined ? before.color : patch.color, updatedAt: nowIso() })
    .where(eq(tags.id, id));
  const row = await db.select().from(tags).where(eq(tags.id, id)).get();
  return c.json(toTagOut(row!));
});

app.delete("/tags/:id", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const before = await db.select().from(tags).where(eq(tags.id, id)).get();
  if (!before) throw ApiError.notFound("Tag");
  await db.delete(tags).where(eq(tags.id, id));
  return c.body(null, 204);
});

export default app;
