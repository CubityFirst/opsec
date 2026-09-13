import { and, desc, gte, isNotNull, lt, lte, ne } from "drizzle-orm";
import { parsePartialDate } from "@shared/schemas/common";
import type { TimelineKind, TimelineQuery } from "@shared/schemas/timeline";
import type { TimelineItem, TimelineResult } from "@shared/types";
import { addDays } from "@shared/recurrence";
import { schema, type Db } from "../db";
import { toBetOut } from "./bets";
import { contactRefs } from "./contacts";
import { toGiftOut } from "./gifts";
import { hydrateInteractions } from "./interactions";
import { toLifeEventOut } from "./life-events";

const { interactions, lifeEvents, gifts, bets } = schema;

/** [first instant, first instant after] of an inclusive day range, as UTC ISO strings for datetime columns. */
function instantBounds(from: string, to: string): [string, string] {
  return [`${from}T00:00:00.000Z`, `${addDays(to, 1)}T00:00:00.000Z`];
}

/**
 * The earliest and latest day a partial date could mean, or null when it has
 * no year (a "--MM-DD" birthday-style date cannot be placed on a timeline).
 */
function partialSpan(value: string): [string, string] | null {
  const p = parsePartialDate(value);
  if (!p || p.year === null) return null;
  const y = String(p.year).padStart(4, "0");
  if (p.month === null) return [`${y}-01-01`, `${y}-12-31`];
  const m = String(p.month).padStart(2, "0");
  if (p.day === null) {
    const last = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
    return [`${y}-${m}-01`, `${y}-${m}-${String(last).padStart(2, "0")}`];
  }
  const d = `${y}-${m}-${String(p.day).padStart(2, "0")}`;
  return [d, d];
}

async function interactionItems(db: Db, from: string, to: string): Promise<TimelineItem[]> {
  const [lo, hi] = instantBounds(from, to);
  const rows = await db
    .select()
    .from(interactions)
    .where(and(gte(interactions.occurredAt, lo), lt(interactions.occurredAt, hi)))
    .orderBy(desc(interactions.occurredAt), desc(interactions.id));
  const out = await hydrateInteractions(db, rows);
  return out.map((i) => ({ kind: "interaction", at: i.occurredAt, interaction: i }));
}

async function lifeEventItems(db: Db, from: string, to: string): Promise<TimelineItem[]> {
  // Coarse SQL cut on the year prefix, then exact overlap in JS since dates may be partial.
  const rows = await db
    .select()
    .from(lifeEvents)
    .where(and(gte(lifeEvents.occurredOn, from.slice(0, 4)), lte(lifeEvents.occurredOn, to)))
    .orderBy(desc(lifeEvents.occurredOn), desc(lifeEvents.id));
  const inRange = rows.filter((r) => {
    const span = partialSpan(r.occurredOn);
    return span !== null && span[0] <= to && span[1] >= from;
  });
  const refs = await contactRefs(db, [...new Set(inRange.map((r) => r.contactId))]);
  return inRange.flatMap((r) => {
    const contact = refs.get(r.contactId);
    return contact ? [{ kind: "lifeEvent" as const, at: r.occurredOn, lifeEvent: toLifeEventOut(r), contact }] : [];
  });
}

async function giftItems(db: Db, from: string, to: string): Promise<TimelineItem[]> {
  const rows = await db
    .select()
    .from(gifts)
    .where(and(ne(gifts.status, "idea"), isNotNull(gifts.givenOn), gte(gifts.givenOn, from), lte(gifts.givenOn, to)))
    .orderBy(desc(gifts.givenOn), desc(gifts.id));
  const refs = await contactRefs(db, [...new Set(rows.map((r) => r.contactId))]);
  return rows.flatMap((r) => {
    const contact = refs.get(r.contactId);
    return contact ? [{ kind: "gift" as const, at: r.givenOn!, gift: toGiftOut(r, contact) }] : [];
  });
}

async function betItems(db: Db, from: string, to: string): Promise<TimelineItem[]> {
  const [lo, hi] = instantBounds(from, to);
  const [made, settled] = await Promise.all([
    db
      .select()
      .from(bets)
      .where(and(gte(bets.madeOn, from), lte(bets.madeOn, to)))
      .orderBy(desc(bets.madeOn), desc(bets.id)),
    db
      .select()
      .from(bets)
      .where(and(isNotNull(bets.settledAt), gte(bets.settledAt, lo), lt(bets.settledAt, hi)))
      .orderBy(desc(bets.settledAt), desc(bets.id)),
  ]);
  const refs = await contactRefs(db, [...new Set([...made, ...settled].map((r) => r.contactId))]);
  const items: TimelineItem[] = [];
  for (const r of made) {
    const contact = refs.get(r.contactId);
    if (contact) items.push({ kind: "bet", at: r.madeOn, bet: toBetOut(r, contact), event: "made" });
  }
  for (const r of settled) {
    const contact = refs.get(r.contactId);
    if (contact) items.push({ kind: "bet", at: r.settledAt!, bet: toBetOut(r, contact), event: "settled" });
  }
  return items;
}

const LOADERS: Record<TimelineKind, (db: Db, from: string, to: string) => Promise<TimelineItem[]>> = {
  interaction: interactionItems,
  lifeEvent: lifeEventItems,
  gift: giftItems,
  bet: betItems,
};

/**
 * Everything that happened between two days, across every contact, newest
 * first. Every kind is loaded so the counts are complete; `kinds` only
 * decides which items are returned.
 */
export async function timeline(db: Db, q: TimelineQuery): Promise<TimelineResult> {
  const wanted = new Set(q.kinds);
  const loaded = await Promise.all((Object.keys(LOADERS) as TimelineKind[]).map(async (k) => [k, await LOADERS[k](db, q.from, q.to)] as const));
  const counts = { interaction: 0, lifeEvent: 0, gift: 0, bet: 0 };
  const items: TimelineItem[] = [];
  for (const [k, list] of loaded) {
    counts[k] = list.length;
    if (wanted.has(k)) items.push(...list);
  }
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { items, counts };
}
