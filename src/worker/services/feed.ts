import { and, desc, eq, lt, ne, type SQL } from "drizzle-orm";
import type { FeedItem, FeedResult } from "@shared/types";
import { schema, type Db } from "../db";
import { toActivityOut } from "./activity";
import { hydrateInteractions } from "./interactions";
import { toLifeEventOut } from "./life-events";

const { activity, interactions, interactionContacts, lifeEvents } = schema;

/**
 * A contact's merged feed: interactions and life events at their own dates,
 * plus system events. Creation events for interactions and life events are
 * omitted because the item itself appears in the feed.
 */
export async function contactFeed(db: Db, id: string, opts: { limit: number; before?: string }): Promise<FeedResult> {
  const { limit, before } = opts;
  const eventWhere: SQL[] = [eq(activity.contactId, id), ne(activity.eventType, "interaction.created"), ne(activity.eventType, "life_event.created")];
  if (before) eventWhere.push(lt(activity.createdAt, before));
  const interactionWhere: SQL[] = [eq(interactionContacts.contactId, id)];
  if (before) interactionWhere.push(lt(interactions.occurredAt, before));
  const lifeWhere: SQL[] = [eq(lifeEvents.contactId, id)];
  if (before) lifeWhere.push(lt(lifeEvents.occurredOn, before));

  const [eventRows, interactionRows, lifeRows] = await Promise.all([
    db
      .select()
      .from(activity)
      .where(and(...eventWhere))
      .orderBy(desc(activity.createdAt), desc(activity.id))
      .limit(limit),
    db
      .select({ interaction: interactions })
      .from(interactionContacts)
      .innerJoin(interactions, eq(interactions.id, interactionContacts.interactionId))
      .where(and(...interactionWhere))
      .orderBy(desc(interactions.occurredAt), desc(interactions.id))
      .limit(limit),
    db
      .select()
      .from(lifeEvents)
      .where(and(...lifeWhere))
      .orderBy(desc(lifeEvents.occurredOn), desc(lifeEvents.id))
      .limit(limit),
  ]);
  const hydrated = await hydrateInteractions(
    db,
    interactionRows.map((r) => r.interaction),
  );

  const items: FeedItem[] = [
    ...eventRows.map((e) => ({ kind: "event" as const, at: e.createdAt, event: toActivityOut(e) })),
    ...hydrated.map((i) => ({ kind: "interaction" as const, at: i.occurredAt, interaction: i })),
    ...lifeRows.map((l) => ({ kind: "lifeEvent" as const, at: l.occurredOn, lifeEvent: toLifeEventOut(l) })),
  ];
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const page = items.slice(0, limit);
  const exhausted = eventRows.length < limit && interactionRows.length < limit && lifeRows.length < limit && page.length === items.length;
  return { items: page, nextBefore: exhausted || page.length === 0 ? null : page[page.length - 1]!.at };
}
