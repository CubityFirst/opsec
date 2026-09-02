import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, gt, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { activityLogQuerySchema, feedQuerySchema } from "@shared/schemas/interaction";
import { schema } from "../db";
import type { AppEnv } from "../env";
import { validationHook } from "../lib/errors";
import { toActivityOut } from "../services/activity";
import { getContactRow } from "../services/contacts";
import { contactFeed } from "../services/feed";

const { activity } = schema;

const app = new Hono<AppEnv>();

/**
 * Per-contact feed: interactions (rendered richly by the UI) merged with
 * system events. `interaction.created` events are omitted because the
 * interaction itself appears in the feed at its `occurredAt`.
 */
app.get("/contacts/:id/activity", zValidator("query", feedQuerySchema, validationHook), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const { limit, before } = c.req.valid("query");
  await getContactRow(db, id);
  return c.json(await contactFeed(db, id, { limit, before }));
});

/** Raw append-only log for programmatic consumers. Ordered oldest → newest; `since` is an exclusive ULID cursor. */
app.get("/activity", zValidator("query", activityLogQuerySchema, validationHook), async (c) => {
  const db = c.get("db");
  const { since, limit, eventType } = c.req.valid("query");
  const where: SQL[] = [];
  if (since) where.push(gt(activity.id, since));
  if (eventType) where.push(eq(activity.eventType, eventType));
  const rows = await db
    .select()
    .from(activity)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(activity.id))
    .limit(limit);
  const items = rows.map(toActivityOut);
  return c.json({ items, nextSince: rows.length === limit ? rows[rows.length - 1].id : null });
});

export default app;
