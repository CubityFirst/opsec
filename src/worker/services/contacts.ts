import { and, asc, count, desc, eq, exists, inArray, isNotNull, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/sqlite-core";
import type { ContactKind } from "@shared/schemas/common";
import type { ContactListQuery } from "@shared/schemas/contact";
import type { ContactDetail, ContactMethodOut, ContactRef, ContactSummary, LastInteraction, ListResult, TagOut } from "@shared/types";
import { schema, type Db } from "../db";
import type { ContactMethodRow, ContactRow, TagRow } from "../db/schema";
import { chunk, runBatch } from "../lib/batch";
import { ApiError } from "../lib/errors";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";

const { contacts, contactMethods, contactTags, tags, interactions, interactionContacts, relationships } = schema;

// Sub-queries inside `exists()` do not need a live connection to build SQL; a
// detached query builder keeps the condition helpers synchronous.
const db0 = new QueryBuilder();

export function computeDisplayName(kind: ContactKind, firstName: string, lastName: string | null | undefined): string {
  const first = firstName.trim();
  if (kind === "person") {
    return [first, lastName?.trim()].filter(Boolean).join(" ");
  }
  return first;
}

export function avatarUrl(fileId: string | null | undefined): string | null {
  return fileId ? `/api/files/${fileId}` : null;
}

export function toContactRef(row: Pick<ContactRow, "id" | "kind" | "displayName" | "avatarFileId">): ContactRef {
  return { id: row.id, kind: row.kind, displayName: row.displayName, avatarUrl: avatarUrl(row.avatarFileId) };
}

export function toTagOut(row: Pick<TagRow, "id" | "name" | "color">): TagOut {
  return { id: row.id, name: row.name, color: row.color };
}

export function toMethodOut(row: ContactMethodRow): ContactMethodOut {
  return {
    id: row.id,
    contactId: row.contactId,
    type: row.type,
    label: row.label,
    value: row.value,
    isPrimary: row.isPrimary,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Build a contains-pattern for LIKE. SQLite has no default ESCAPE character,
 * so wildcards in user input are left as-is: `_` and `%` simply widen the
 * match, which is harmless for a search box (and keeps "__probe" findable).
 */
export function likePattern(q: string): string {
  return `%${q}%`;
}

export async function tagsForContacts(db: Db, ids: string[]): Promise<Map<string, TagOut[]>> {
  const map = new Map<string, TagOut[]>();
  for (const part of chunk(ids)) {
    const rows = await db
      .select({ contactId: contactTags.contactId, id: tags.id, name: tags.name, color: tags.color })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(inArray(contactTags.contactId, part))
      .orderBy(asc(tags.nameLower));
    for (const r of rows) {
      const list = map.get(r.contactId) ?? [];
      list.push({ id: r.id, name: r.name, color: r.color });
      map.set(r.contactId, list);
    }
  }
  return map;
}

export async function lastInteractionsFor(db: Db, ids: string[]): Promise<Map<string, LastInteraction>> {
  const map = new Map<string, LastInteraction>();
  for (const part of chunk(ids)) {
    const rows = await db
      .select({
        contactId: interactionContacts.contactId,
        id: interactions.id,
        type: interactions.type,
        occurredAt: interactions.occurredAt,
        summary: interactions.summary,
      })
      .from(interactionContacts)
      .innerJoin(interactions, eq(interactions.id, interactionContacts.interactionId))
      .where(inArray(interactionContacts.contactId, part))
      .orderBy(desc(interactions.occurredAt), desc(interactions.id));
    for (const r of rows) {
      if (!map.has(r.contactId)) {
        map.set(r.contactId, { id: r.id, type: r.type, occurredAt: r.occurredAt, summary: r.summary });
      }
    }
  }
  return map;
}

async function primaryMethodsFor(db: Db, ids: string[]): Promise<Map<string, { email: string | null; phone: string | null }>> {
  const map = new Map<string, { email: string | null; phone: string | null }>();
  for (const part of chunk(ids)) {
    const rows = await db
      .select()
      .from(contactMethods)
      .where(and(inArray(contactMethods.contactId, part), inArray(contactMethods.type, ["email", "phone"])))
      .orderBy(desc(contactMethods.isPrimary), asc(contactMethods.sortOrder), asc(contactMethods.createdAt));
    for (const r of rows) {
      const entry = map.get(r.contactId) ?? { email: null, phone: null };
      if (r.type === "email" && entry.email === null) entry.email = r.value;
      if (r.type === "phone" && entry.phone === null) entry.phone = r.value;
      map.set(r.contactId, entry);
    }
  }
  return map;
}

export async function hydrateSummaries(db: Db, rows: ContactRow[]): Promise<ContactSummary[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const employerIds = [...new Set(rows.map((r) => r.employerContactId).filter((x): x is string => !!x))];
  const [tagMap, methodMap, lastMap, employerMap] = await Promise.all([
    tagsForContacts(db, ids),
    primaryMethodsFor(db, ids),
    lastInteractionsFor(db, ids),
    contactRefs(db, employerIds),
  ]);
  return rows.map((r) => ({
    ...toContactRef(r),
    firstName: r.firstName,
    lastName: r.lastName,
    nickname: r.nickname,
    pronouns: r.pronouns,
    animalType: r.animalType,
    otherNames: Array.isArray(r.otherNames) ? r.otherNames : [],
    jobTitle: r.jobTitle,
    employer: (r.employerContactId && employerMap.get(r.employerContactId)) || null,
    birthday: r.birthday,
    avatarFullUrl: avatarUrl(r.avatarOriginalFileId),
    tags: tagMap.get(r.id) ?? [],
    primaryEmail: methodMap.get(r.id)?.email ?? null,
    primaryPhone: methodMap.get(r.id)?.phone ?? null,
    lastInteraction: lastMap.get(r.id) ?? null,
    archivedAt: r.archivedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

const lastContactedExpr = sql<string>`(SELECT MAX(${interactions.occurredAt}) FROM ${interactions} INNER JOIN ${interactionContacts} ON ${interactionContacts.interactionId} = ${interactions.id} WHERE ${interactionContacts.contactId} = ${contacts.id})`;

export function contactSearchCondition(q: string): SQL {
  const pattern = likePattern(q);
  return or(
    like(contacts.displayName, pattern),
    like(contacts.nickname, pattern),
    // JSON text of [{label,value}]: a LIKE over it matches other names.
    like(contacts.otherNames, pattern),
    exists(
      db0
        .select({ one: sql`1` })
        .from(contactMethods)
        .where(and(eq(contactMethods.contactId, contacts.id), like(contactMethods.value, pattern))),
    ),
    exists(
      db0
        .select({ one: sql`1` })
        .from(contactTags)
        .innerJoin(tags, eq(tags.id, contactTags.tagId))
        .where(and(eq(contactTags.contactId, contacts.id), like(tags.name, pattern))),
    ),
  )!;
}

export async function listContacts(db: Db, query: ContactListQuery): Promise<ListResult<ContactSummary>> {
  const conditions: SQL[] = [query.archived ? isNotNull(contacts.archivedAt) : isNull(contacts.archivedAt)];
  if (query.kind) conditions.push(eq(contacts.kind, query.kind));
  if (query.tag) {
    conditions.push(
      exists(
        db0
          .select({ one: sql`1` })
          .from(contactTags)
          .innerJoin(tags, eq(tags.id, contactTags.tagId))
          .where(and(eq(contactTags.contactId, contacts.id), eq(tags.nameLower, query.tag.toLowerCase()))),
      ),
    );
  }
  if (query.q) conditions.push(contactSearchCondition(query.q));
  const where = and(...conditions);

  const orderBy =
    query.sort === "updated"
      ? [desc(contacts.updatedAt)]
      : query.sort === "lastContacted"
        ? [desc(sql`COALESCE(${lastContactedExpr}, '')`), asc(contacts.displayName)]
        : [asc(sql`lower(${contacts.displayName})`)];

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(contacts).where(where),
    db.select().from(contacts).where(where).orderBy(...orderBy).limit(query.limit).offset(query.offset),
  ]);
  return { items: await hydrateSummaries(db, rows), total };
}

export async function getContactRow(db: Db, id: string): Promise<ContactRow> {
  const row = await db.select().from(contacts).where(eq(contacts.id, id)).get();
  if (!row) throw ApiError.notFound("Contact");
  return row;
}

export async function getContactDetail(db: Db, id: string): Promise<ContactDetail> {
  const row = await getContactRow(db, id);
  const [[summary], methods, [{ relationshipCount }]] = await Promise.all([
    hydrateSummaries(db, [row]),
    db.select().from(contactMethods).where(eq(contactMethods.contactId, id)).orderBy(asc(contactMethods.sortOrder), asc(contactMethods.createdAt)),
    db
      .select({ relationshipCount: count() })
      .from(relationships)
      .where(or(eq(relationships.fromContactId, id), eq(relationships.toContactId, id))),
  ]);
  const metVia = row.metViaContactId ? ((await contactRefs(db, [row.metViaContactId])).get(row.metViaContactId) ?? null) : null;
  return {
    ...summary,
    metOn: row.metOn,
    metWhere: row.metWhere,
    metHow: row.metHow,
    metVia,
    notes: row.notes,
    customFields: (row.customFields ?? {}) as ContactDetail["customFields"],
    methods: methods.map(toMethodOut),
    relationshipCount,
    avatarFileId: row.avatarFileId,
    avatarOriginalFileId: row.avatarOriginalFileId,
  };
}

/** Look up tags by name (case-insensitive), creating any that do not exist. Returns rows in input order. */
export async function ensureTags(db: Db, names: string[]): Promise<TagRow[]> {
  const wanted = new Map<string, string>();
  for (const n of names) {
    const trimmed = n.trim();
    if (trimmed) wanted.set(trimmed.toLowerCase(), trimmed);
  }
  if (wanted.size === 0) return [];
  const lowers = [...wanted.keys()];
  const existing: TagRow[] = [];
  for (const part of chunk(lowers)) {
    existing.push(...(await db.select().from(tags).where(inArray(tags.nameLower, part))));
  }
  const have = new Set(existing.map((t) => t.nameLower));
  const now = nowIso();
  const missing = lowers
    .filter((l) => !have.has(l))
    .map((l) => ({ id: newId(), name: wanted.get(l)!, nameLower: l, color: null, createdAt: now, updatedAt: now }));
  if (missing.length > 0) {
    await runBatch(db, chunk(missing, 16).map((part) => db.insert(tags).values(part)));
  }
  const all = [...existing, ...missing];
  return lowers.map((l) => all.find((t) => t.nameLower === l)!);
}

/** Look up tags by name (case-insensitive) without creating any. */
export async function existingTags(db: Db, names: string[]): Promise<TagRow[]> {
  const lowers = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  const out: TagRow[] = [];
  for (const part of chunk(lowers)) out.push(...(await db.select().from(tags).where(inArray(tags.nameLower, part))));
  return out;
}

export async function contactRefs(db: Db, ids: string[]): Promise<Map<string, ContactRef>> {
  const map = new Map<string, ContactRef>();
  for (const part of chunk(ids)) {
    const rows = await db
      .select({ id: contacts.id, kind: contacts.kind, displayName: contacts.displayName, avatarFileId: contacts.avatarFileId })
      .from(contacts)
      .where(inArray(contacts.id, part));
    for (const r of rows) map.set(r.id, toContactRef(r));
  }
  return map;
}
