import { and, asc, count, desc, eq, exists, gte, inArray, like, lte, or, sql, type SQL } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/sqlite-core";
import type { InteractionOut, ListResult } from "@shared/types";
import { schema, type Db } from "../db";
import type { InteractionRow } from "../db/schema";
import { chunk } from "../lib/batch";
import { ApiError } from "../lib/errors";
import { likePattern, toContactRef, contactRefColumns } from "./contacts";
import { toFileOut } from "./files";

const { contacts, interactions, interactionContacts, files } = schema;
// Detached builder for sub-queries inside exists().
const db0 = new QueryBuilder();

export async function getInteractionRow(db: Db, id: string): Promise<InteractionRow> {
  const row = await db.select().from(interactions).where(eq(interactions.id, id)).get();
  if (!row) throw ApiError.notFound("Interaction");
  return row;
}

export async function participantIds(db: Db, interactionId: string): Promise<string[]> {
  const rows = await db
    .select({ contactId: interactionContacts.contactId })
    .from(interactionContacts)
    .where(eq(interactionContacts.interactionId, interactionId));
  return rows.map((r) => r.contactId);
}

/** Hydrate interaction rows with participants and attachments, preserving input order. */
export async function hydrateInteractions(db: Db, rows: InteractionRow[]): Promise<InteractionOut[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const participants = new Map<string, InteractionOut["participants"]>();
  const attachments = new Map<string, InteractionOut["attachments"]>();
  for (const part of chunk(ids)) {
    const [pRows, fRows] = await Promise.all([
      db
        .select({
          interactionId: interactionContacts.interactionId,
          ...contactRefColumns,
        })
        .from(interactionContacts)
        .innerJoin(contacts, eq(contacts.id, interactionContacts.contactId))
        .where(inArray(interactionContacts.interactionId, part))
        .orderBy(asc(contacts.displayName)),
      db.select().from(files).where(inArray(files.interactionId, part)).orderBy(desc(files.createdAt)),
    ]);
    for (const p of pRows) {
      const list = participants.get(p.interactionId) ?? [];
      list.push(toContactRef(p));
      participants.set(p.interactionId, list);
    }
    for (const f of fRows) {
      const list = attachments.get(f.interactionId!) ?? [];
      list.push(toFileOut(f));
      attachments.set(f.interactionId!, list);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    occurredAt: r.occurredAt,
    summary: r.summary,
    body: r.body,
    location: r.location,
    participants: participants.get(r.id) ?? [],
    attachments: attachments.get(r.id) ?? [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export interface InteractionSearch {
  /** Restrict to interactions this contact took part in. */
  contactId?: string;
  /** Case-insensitive substring over summary, body and location. */
  q?: string;
  type?: InteractionRow["type"];
  since?: string;
  until?: string;
  limit: number;
  offset?: number;
}

/** Interactions matching the filters, newest first, with total count. */
export async function searchInteractions(db: Db, f: InteractionSearch): Promise<ListResult<InteractionOut>> {
  const where: SQL[] = [];
  if (f.contactId) {
    where.push(
      exists(
        db0
          .select({ one: sql`1` })
          .from(interactionContacts)
          .where(and(eq(interactionContacts.interactionId, interactions.id), eq(interactionContacts.contactId, f.contactId))),
      ),
    );
  }
  if (f.q) {
    const pattern = likePattern(f.q);
    where.push(or(like(interactions.summary, pattern), like(interactions.body, pattern), like(interactions.location, pattern))!);
  }
  if (f.type) where.push(eq(interactions.type, f.type));
  if (f.since) where.push(gte(interactions.occurredAt, f.since));
  if (f.until) where.push(lte(interactions.occurredAt, f.until));
  const cond = where.length > 0 ? and(...where) : undefined;
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(interactions).where(cond),
    db
      .select()
      .from(interactions)
      .where(cond)
      .orderBy(desc(interactions.occurredAt), desc(interactions.id))
      .limit(f.limit)
      .offset(f.offset ?? 0),
  ]);
  return { items: await hydrateInteractions(db, rows), total };
}

/** A contact's interactions, newest first. */
export function listContactInteractions(db: Db, contactId: string, opts: { limit: number; offset?: number }): Promise<ListResult<InteractionOut>> {
  return searchInteractions(db, { contactId, limit: opts.limit, offset: opts.offset });
}

export async function getInteractionOut(db: Db, id: string): Promise<InteractionOut> {
  const [out] = await hydrateInteractions(db, [await getInteractionRow(db, id)]);
  return out;
}
