import { and, asc, count, desc, eq, isNotNull, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { BetListQuery } from "@shared/schemas/bet";
import type { BetListResult, BetOut, BetRecord } from "@shared/types";
import { schema, type Db } from "../db";
import type { BetRow } from "../db/schema";
import { ApiError } from "../lib/errors";
import { contactRefColumns, contactRefs, toContactRef } from "./contacts";

const { bets, contacts } = schema;

/** Today's date as YYYY-MM-DD (UTC). Bets are day-granular so the timezone edge is acceptable. */
export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function toBetOut(r: BetRow, contact: BetOut["contact"]): BetOut {
  return {
    id: r.id,
    contact,
    prediction: r.prediction,
    wager: r.wager,
    madeOn: r.madeOn,
    reviewOn: r.reviewOn,
    details: r.details,
    status: r.outcome ? "settled" : "open",
    outcome: r.outcome,
    settledAt: r.settledAt,
    settledNote: r.settledNote,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function getBetRow(db: Db, id: string): Promise<BetRow> {
  const row = await db.select().from(bets).where(eq(bets.id, id)).get();
  if (!row) throw ApiError.notFound("Bet");
  return row;
}

export async function getBetOut(db: Db, id: string): Promise<BetOut> {
  const row = await db
    .select({ bet: bets, contact: contactRefColumns })
    .from(bets)
    .innerJoin(contacts, eq(contacts.id, bets.contactId))
    .where(eq(bets.id, id))
    .get();
  if (!row) throw ApiError.notFound("Bet");
  return toBetOut(row.bet, toContactRef(row.contact));
}

async function hydrate(db: Db, rows: BetRow[]): Promise<BetOut[]> {
  const refs = await contactRefs(db, [...new Set(rows.map((r) => r.contactId))]);
  return rows.flatMap((r) => {
    const c = refs.get(r.contactId);
    return c ? [toBetOut(r, c)] : [];
  });
}

/**
 * Open bets first (soonest review date on top), then settled ones newest
 * first. This is the order both the contact card and the Bets page want.
 */
const ORDER = [sql`case when ${bets.outcome} is null then 0 else 1 end`, sql`case when ${bets.outcome} is null then ${bets.reviewOn} end asc`, desc(bets.settledAt), desc(bets.id)];

/** A contact's bets: open first, then settled. */
export async function listContactBets(db: Db, contactId: string): Promise<BetOut[]> {
  const rows = await db
    .select()
    .from(bets)
    .where(eq(bets.contactId, contactId))
    .orderBy(...ORDER);
  return hydrate(db, rows);
}

/** Won/lost/void tally plus how many are still open. */
export async function betRecord(db: Db, where?: SQL): Promise<BetRecord> {
  const rows = await db
    .select({ outcome: bets.outcome, n: count() })
    .from(bets)
    .where(where)
    .groupBy(bets.outcome);
  const rec: BetRecord = { open: 0, won: 0, lost: 0, void: 0 };
  for (const r of rows) {
    if (r.outcome === null) rec.open = r.n;
    else if (r.outcome === "me") rec.won = r.n;
    else if (r.outcome === "them") rec.lost = r.n;
    else rec.void = r.n;
  }
  return rec;
}

/** Every bet, filtered by status and (for open bets) a review-by date. */
export async function listBets(db: Db, q: BetListQuery, opts: { contactId?: string } = {}): Promise<BetListResult> {
  const where: SQL[] = [];
  if (opts.contactId) where.push(eq(bets.contactId, opts.contactId));
  const recordWhere = where.length ? and(...where) : undefined;
  if (q.status === "open") where.push(isNull(bets.outcome));
  if (q.status === "settled") where.push(isNotNull(bets.outcome));
  if (q.dueBy) where.push(isNull(bets.outcome), lte(bets.reviewOn, q.dueBy));
  const cond = where.length ? and(...where) : undefined;
  const [rows, [total], record] = await Promise.all([
    db
      .select()
      .from(bets)
      .where(cond)
      .orderBy(...(q.dueBy ? [asc(bets.reviewOn), asc(bets.id)] : ORDER))
      .limit(q.limit)
      .offset(q.offset),
    db.select({ n: count() }).from(bets).where(cond),
    betRecord(db, recordWhere),
  ]);
  return { items: await hydrate(db, rows), total: total?.n ?? 0, record };
}
