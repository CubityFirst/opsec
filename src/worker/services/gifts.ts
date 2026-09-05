import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import type { GiftListQuery } from "@shared/schemas/gift";
import type { GiftCounts, GiftListResult, GiftOut } from "@shared/types";
import { schema, type Db } from "../db";
import type { GiftRow } from "../db/schema";
import { ApiError } from "../lib/errors";
import { contactRefColumns, contactRefs, toContactRef } from "./contacts";

const { gifts, contacts } = schema;

export function toGiftOut(r: GiftRow, contact: GiftOut["contact"]): GiftOut {
  return {
    id: r.id,
    contact,
    name: r.name,
    status: r.status,
    occasion: r.occasion,
    givenOn: r.givenOn,
    price: r.price,
    url: r.url,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function getGiftRow(db: Db, id: string): Promise<GiftRow> {
  const row = await db.select().from(gifts).where(eq(gifts.id, id)).get();
  if (!row) throw ApiError.notFound("Gift");
  return row;
}

export async function getGiftOut(db: Db, id: string): Promise<GiftOut> {
  const row = await db
    .select({ gift: gifts, contact: contactRefColumns })
    .from(gifts)
    .innerJoin(contacts, eq(contacts.id, gifts.contactId))
    .where(eq(gifts.id, id))
    .get();
  if (!row) throw ApiError.notFound("Gift");
  return toGiftOut(row.gift, toContactRef(row.contact));
}

async function hydrate(db: Db, rows: GiftRow[]): Promise<GiftOut[]> {
  const refs = await contactRefs(db, [...new Set(rows.map((r) => r.contactId))]);
  return rows.flatMap((r) => {
    const c = refs.get(r.contactId);
    return c ? [toGiftOut(r, c)] : [];
  });
}

/** Ideas first (newest first), then given and received by the day they changed hands, newest first. */
const ORDER = [sql`case when ${gifts.status} = 'idea' then 0 else 1 end`, desc(gifts.givenOn), desc(gifts.id)];

/** Idea / given / received tally. */
export async function giftCounts(db: Db, where?: SQL): Promise<GiftCounts> {
  const rows = await db.select({ status: gifts.status, n: count() }).from(gifts).where(where).groupBy(gifts.status);
  const counts: GiftCounts = { idea: 0, given: 0, received: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

/** Every gift, optionally one contact's, optionally one status. */
export async function listGifts(db: Db, q: GiftListQuery, opts: { contactId?: string } = {}): Promise<GiftListResult> {
  const where: SQL[] = [];
  if (opts.contactId) where.push(eq(gifts.contactId, opts.contactId));
  const countsWhere = where.length ? and(...where) : undefined;
  if (q.status) where.push(eq(gifts.status, q.status));
  const cond = where.length ? and(...where) : undefined;
  const [rows, [total], counts] = await Promise.all([
    db
      .select()
      .from(gifts)
      .where(cond)
      .orderBy(...ORDER)
      .limit(q.limit)
      .offset(q.offset),
    db.select({ n: count() }).from(gifts).where(cond),
    giftCounts(db, countsWhere),
  ]);
  return { items: await hydrate(db, rows), total: total?.n ?? 0, counts };
}
