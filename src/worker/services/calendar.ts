import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { CalendarFeedCreateInput, CalendarFeedOut, CalendarFeedUpdateInput, CalendarSource } from "@shared/schemas/calendar";
import { parsePartialDate } from "@shared/schemas/common";
import type { ContactRef } from "@shared/types";
import { schema, type Db } from "../db";
import type { CalendarFeedRow } from "../db/schema";
import { buildCalendar, repeatRule, yearlyRule, type IcalEvent } from "../lib/ical";
import { newId } from "../lib/ids";
import type { SessionUser } from "../lib/session";
import { nowIso } from "../lib/time";
import { contactRefs } from "./contacts";
import { participantsFor } from "./interactions";
import { repeatOf } from "./reminders";
import { ensureUserRow } from "./tokens";

const { calendarFeeds, contacts, interactions, reminders, lifeEvents, bets, gifts } = schema;

const LAST_FETCHED_GRANULARITY_MS = 5 * 60 * 1000;
/** Placeholder year for a birthday whose year is unknown; a leap year so 29 Feb exists. */
const UNKNOWN_BIRTH_YEAR = 1972;

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function toFeedOut(r: CalendarFeedRow): CalendarFeedOut {
  return { id: r.id, name: r.name, sources: r.sources as CalendarSource[], key: r.key, createdAt: r.createdAt, updatedAt: r.updatedAt, lastFetchedAt: r.lastFetchedAt };
}

export async function listFeeds(db: Db, sub: string): Promise<CalendarFeedOut[]> {
  const rows = await db.select().from(calendarFeeds).where(eq(calendarFeeds.sub, sub)).orderBy(asc(calendarFeeds.createdAt));
  return rows.map(toFeedOut);
}

export async function createFeed(db: Db, user: SessionUser, input: CalendarFeedCreateInput): Promise<CalendarFeedOut> {
  const now = nowIso();
  const row: CalendarFeedRow = { id: newId(), sub: user.sub, name: input.name, sources: input.sources, key: randomKey(), lastFetchedAt: null, createdAt: now, updatedAt: now };
  await ensureUserRow(db, user, now);
  await db.insert(calendarFeeds).values(row);
  return toFeedOut(row);
}

async function ownFeed(db: Db, sub: string, id: string): Promise<CalendarFeedRow | null> {
  return (await db.select().from(calendarFeeds).where(and(eq(calendarFeeds.id, id), eq(calendarFeeds.sub, sub))).get()) ?? null;
}

export async function updateFeed(db: Db, sub: string, id: string, patch: CalendarFeedUpdateInput): Promise<CalendarFeedOut | null> {
  const row = await ownFeed(db, sub, id);
  if (!row) return null;
  const next: CalendarFeedRow = { ...row, name: patch.name ?? row.name, sources: patch.sources ?? row.sources, updatedAt: nowIso() };
  await db.update(calendarFeeds).set({ name: next.name, sources: next.sources, updatedAt: next.updatedAt }).where(eq(calendarFeeds.id, id));
  return toFeedOut(next);
}

/** Replace the secret so the old subscription URL stops working. */
export async function rotateFeedKey(db: Db, sub: string, id: string): Promise<CalendarFeedOut | null> {
  const row = await ownFeed(db, sub, id);
  if (!row) return null;
  const next: CalendarFeedRow = { ...row, key: randomKey(), updatedAt: nowIso() };
  await db.update(calendarFeeds).set({ key: next.key, updatedAt: next.updatedAt }).where(eq(calendarFeeds.id, id));
  return toFeedOut(next);
}

export async function deleteFeed(db: Db, sub: string, id: string): Promise<boolean> {
  const row = await ownFeed(db, sub, id);
  if (!row) return false;
  await db.delete(calendarFeeds).where(eq(calendarFeeds.id, id));
  return true;
}

/** The feed behind a subscription key, or null. Records the fetch (coarsely) for the Account page. */
export async function feedByKey(db: Db, key: string): Promise<CalendarFeedRow | null> {
  const row = await db.select().from(calendarFeeds).where(eq(calendarFeeds.key, key)).get();
  if (!row) return null;
  if (!row.lastFetchedAt || Date.now() - Date.parse(row.lastFetchedAt) > LAST_FETCHED_GRANULARITY_MS) {
    await db.update(calendarFeeds).set({ lastFetchedAt: nowIso() }).where(eq(calendarFeeds.id, row.id));
  }
  return row;
}

function names(refs: ContactRef[]): string {
  return refs.map((r) => r.displayName).join(", ");
}

function withContact(text: string, ref: ContactRef | null | undefined): string {
  return ref ? `${text} · ${ref.displayName}` : text;
}

type Links = { contact: (id: string) => string; interaction: (id: string) => string; reminders: string };

async function interactionEvents(db: Db, links: Links): Promise<IcalEvent[]> {
  const rows = await db.select().from(interactions).orderBy(desc(interactions.occurredAt));
  const people = await participantsFor(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => {
    const refs = people.get(r.id) ?? [];
    const who = names(refs);
    return {
      uid: `interaction-${r.id}@opsec`,
      start: r.occurredAt,
      summary: who ? `${r.summary} · ${who}` : r.summary,
      description: [who ? `With ${who}` : null, r.body].filter(Boolean).join("\n\n") || null,
      location: r.location,
      url: links.interaction(r.id),
      categories: ["Interaction", r.type],
    };
  });
}

async function reminderEvents(db: Db, links: Links): Promise<IcalEvent[]> {
  const rows = await db.select().from(reminders).where(isNull(reminders.completedAt)).orderBy(asc(reminders.dueOn));
  const refs = await contactRefs(db, [...new Set(rows.flatMap((r) => (r.contactId ? [r.contactId] : [])))]);
  return rows.map((r) => {
    const ref = r.contactId ? refs.get(r.contactId) : null;
    const repeat = repeatOf(r);
    return {
      uid: `reminder-${r.id}@opsec`,
      day: r.dueOn,
      rrule: repeat ? repeatRule(repeat, r.dueOn) : null,
      summary: withContact(r.title, ref),
      description: r.notes,
      url: ref ? links.contact(ref.id) : links.reminders,
      categories: ["Reminder"],
    };
  });
}

async function birthdayEvents(db: Db, links: Links): Promise<IcalEvent[]> {
  const rows = await db
    .select({ id: contacts.id, displayName: contacts.displayName, birthday: contacts.birthday })
    .from(contacts)
    .where(and(inArray(contacts.kind, ["person", "pet"]), isNotNull(contacts.birthday), isNull(contacts.archivedAt), isNull(contacts.deceasedAt)))
    .orderBy(asc(contacts.displayName));
  const out: IcalEvent[] = [];
  for (const r of rows) {
    const p = parsePartialDate(r.birthday!);
    if (!p || p.month === null || p.day === null) continue;
    const year = p.year ?? UNKNOWN_BIRTH_YEAR;
    out.push({
      uid: `birthday-${r.id}@opsec`,
      day: `${String(year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
      rrule: yearlyRule(p.month, p.day),
      summary: `${r.displayName}'s birthday`,
      description: p.year ? `Born ${r.birthday}` : null,
      url: links.contact(r.id),
      categories: ["Birthday"],
    });
  }
  return out;
}

async function lifeEventEvents(db: Db, links: Links): Promise<IcalEvent[]> {
  const rows = await db.select().from(lifeEvents).orderBy(asc(lifeEvents.occurredOn));
  const refs = await contactRefs(db, [...new Set(rows.map((r) => r.contactId))]);
  const out: IcalEvent[] = [];
  for (const r of rows) {
    const p = parsePartialDate(r.occurredOn);
    if (!p || p.year === null || p.month === null || p.day === null) continue;
    out.push({
      uid: `life-event-${r.id}@opsec`,
      day: r.occurredOn,
      summary: withContact(r.title, refs.get(r.contactId)),
      description: r.body,
      url: links.contact(r.contactId),
      categories: ["Life event"],
    });
  }
  return out;
}

async function betEvents(db: Db, links: Links): Promise<IcalEvent[]> {
  const rows = await db.select().from(bets).where(isNull(bets.outcome)).orderBy(asc(bets.reviewOn));
  const refs = await contactRefs(db, [...new Set(rows.map((r) => r.contactId))]);
  return rows.map((r) => {
    const ref = refs.get(r.contactId);
    return {
      uid: `bet-${r.id}@opsec`,
      day: r.reviewOn,
      summary: `Bet${ref ? ` with ${ref.displayName}` : ""}: ${r.prediction}`,
      description: [r.wager ? `Stake: ${r.wager}` : null, `Made on ${r.madeOn}`, r.details].filter(Boolean).join("\n"),
      url: links.contact(r.contactId),
      categories: ["Bet"],
    };
  });
}

async function giftEvents(db: Db, links: Links): Promise<IcalEvent[]> {
  const rows = await db.select().from(gifts).where(isNotNull(gifts.givenOn)).orderBy(asc(gifts.givenOn));
  const refs = await contactRefs(db, [...new Set(rows.map((r) => r.contactId))]);
  return rows.map((r) => {
    const ref = refs.get(r.contactId);
    const who = ref?.displayName ?? "someone";
    return {
      uid: `gift-${r.id}@opsec`,
      day: r.givenOn!,
      summary: r.status === "received" ? `Gift from ${who}: ${r.name}` : `Gift for ${who}: ${r.name}`,
      description: [r.occasion, r.price, r.notes].filter(Boolean).join("\n") || null,
      url: links.contact(r.contactId),
      categories: ["Gift"],
    };
  });
}

const BUILDERS: Record<CalendarSource, (db: Db, links: Links) => Promise<IcalEvent[]>> = {
  interactions: interactionEvents,
  reminders: reminderEvents,
  birthdays: birthdayEvents,
  life_events: lifeEventEvents,
  bets: betEvents,
  gifts: giftEvents,
};

/** The iCalendar document for a feed. `origin` builds the links back into the app. */
export async function renderFeed(db: Db, feed: Pick<CalendarFeedRow, "name" | "sources">, origin: string, now = nowIso()): Promise<string> {
  const links: Links = { contact: (id) => `${origin}/contacts/${id}`, interaction: (id) => `${origin}/interactions/${id}`, reminders: `${origin}/reminders` };
  const events: IcalEvent[] = [];
  for (const source of feed.sources as CalendarSource[]) {
    const build = BUILDERS[source];
    if (build) events.push(...(await build(db, links)));
  }
  return buildCalendar({ name: feed.name, events, now });
}
