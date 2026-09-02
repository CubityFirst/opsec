import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { SearchHit, SearchResult } from "@shared/types";
import { schema } from "../db";
import type { AppEnv } from "../env";
import { validationHook } from "../lib/errors";
import { likePattern, toContactRef } from "../services/contacts";

const { contacts, contactMethods, contactTags, tags } = schema;

const app = new Hono<AppEnv>();

const querySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  includeArchived: z.enum(["true", "false"]).optional().default("false"),
});

app.get("/search", zValidator("query", querySchema, validationHook), async (c) => {
  const db = c.get("db");
  const { q, limit, includeArchived } = c.req.valid("query");
  const pattern = likePattern(q);
  const archivedFilter = includeArchived === "true" ? undefined : isNull(contacts.archivedAt);
  const hits = new Map<string, SearchHit>();
  const add = (row: Parameters<typeof toContactRef>[0], matchedOn: SearchHit["matchedOn"], matchText: string) => {
    if (!hits.has(row.id)) hits.set(row.id, { ...toContactRef(row), matchedOn, matchText });
  };

  const byName = await db
    .select({ id: contacts.id, kind: contacts.kind, displayName: contacts.displayName, avatarFileId: contacts.avatarFileId, nickname: contacts.nickname })
    .from(contacts)
    .where(and(archivedFilter, or(like(contacts.displayName, pattern), like(contacts.otherNames, pattern))))
    .orderBy(asc(contacts.displayName))
    .limit(limit);
  for (const r of byName) add(r, "name", r.displayName);

  if (hits.size < limit) {
    const byNick = await db
      .select({ id: contacts.id, kind: contacts.kind, displayName: contacts.displayName, avatarFileId: contacts.avatarFileId, nickname: contacts.nickname })
      .from(contacts)
      .where(and(archivedFilter, like(contacts.nickname, pattern)))
      .limit(limit);
    for (const r of byNick) add(r, "nickname", r.nickname ?? "");
  }

  if (hits.size < limit) {
    const byMethod = await db
      .select({ id: contacts.id, kind: contacts.kind, displayName: contacts.displayName, avatarFileId: contacts.avatarFileId, value: contactMethods.value })
      .from(contactMethods)
      .innerJoin(contacts, eq(contacts.id, contactMethods.contactId))
      .where(and(archivedFilter, like(contactMethods.value, pattern)))
      .limit(limit);
    for (const r of byMethod) add(r, "method", r.value);
  }

  if (hits.size < limit) {
    const tagRows = await db.select({ id: tags.id, name: tags.name }).from(tags).where(like(tags.name, pattern)).limit(10);
    if (tagRows.length > 0) {
      const byTag = await db
        .select({ id: contacts.id, kind: contacts.kind, displayName: contacts.displayName, avatarFileId: contacts.avatarFileId, tagName: tags.name })
        .from(contactTags)
        .innerJoin(contacts, eq(contacts.id, contactTags.contactId))
        .innerJoin(tags, eq(tags.id, contactTags.tagId))
        .where(
          and(
            archivedFilter,
            inArray(
              contactTags.tagId,
              tagRows.map((t) => t.id),
            ),
          ),
        )
        .limit(limit);
      for (const r of byTag) add(r, "tag", r.tagName);
    }
  }

  const result: SearchResult = { contacts: [...hits.values()].slice(0, limit) };
  return c.json(result);
});

export default app;
