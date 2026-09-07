import { and, asc, desc, eq, exists, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/sqlite-core";
import type { MapPinsQuery } from "@shared/schemas/geo";
import type { MapPin, MapPinsResult } from "@shared/types";
import { schema, type Db } from "../db";
import { contactRefColumns, getContactRow, toContactRef, toCoordinates } from "./contacts";
import { participantsFor } from "./interactions";

const { contacts, contactMethods, interactions, interactionContacts } = schema;
const db0 = new QueryBuilder();

/** Per layer; a personal CRM never gets near it, but the map should not try to draw a million markers. */
export const MAP_MAX_PINS = 2000;

/**
 * Every marker for the Map page: contacts at their address methods and
 * interactions where they happened. Scoped to a contact, it is that contact's
 * addresses (whatever their status) plus the interactions they took part in;
 * unscoped, it mirrors the default contact list (living, unarchived) unless
 * `archived` asks for archived contacts too. Interactions are never filtered
 * by participant status: they happened.
 */
export async function listMapPins(db: Db, q: MapPinsQuery): Promise<MapPinsResult> {
  if (q.contactId) await getContactRow(db, q.contactId);

  const contactWhere: SQL[] = [eq(contactMethods.type, "address"), isNotNull(contactMethods.lat), isNotNull(contactMethods.lng)];
  if (q.contactId) contactWhere.push(eq(contacts.id, q.contactId));
  else {
    contactWhere.push(isNull(contacts.deceasedAt));
    if (!q.archived) contactWhere.push(isNull(contacts.archivedAt));
  }

  const interactionWhere: SQL[] = [isNotNull(interactions.lat), isNotNull(interactions.lng)];
  if (q.contactId) {
    interactionWhere.push(
      exists(
        db0
          .select({ one: sql`1` })
          .from(interactionContacts)
          .where(and(eq(interactionContacts.interactionId, interactions.id), eq(interactionContacts.contactId, q.contactId))),
      ),
    );
  }

  const [methodRows, interactionRows] = await Promise.all([
    db
      .select({
        methodId: contactMethods.id,
        label: contactMethods.label,
        value: contactMethods.value,
        lat: contactMethods.lat,
        lng: contactMethods.lng,
        radiusM: contactMethods.radiusM,
        sortOrder: contactMethods.sortOrder,
        ...contactRefColumns,
      })
      .from(contactMethods)
      .innerJoin(contacts, eq(contacts.id, contactMethods.contactId))
      .where(and(...contactWhere))
      .orderBy(asc(sql`lower(${contacts.displayName})`), asc(contactMethods.sortOrder))
      .limit(MAP_MAX_PINS),
    db
      .select()
      .from(interactions)
      .where(and(...interactionWhere))
      .orderBy(desc(interactions.occurredAt), desc(interactions.id))
      .limit(MAP_MAX_PINS),
  ]);
  const participants = await participantsFor(
    db,
    interactionRows.map((r) => r.id),
  );

  const items: MapPin[] = [
    ...methodRows.map(
      (r): MapPin => ({
        kind: "contact",
        id: `method:${r.methodId}`,
        methodId: r.methodId,
        contact: toContactRef(r),
        label: r.label,
        address: r.value,
        coordinates: toCoordinates(r.lat, r.lng, r.radiusM)!,
      }),
    ),
    ...interactionRows.map(
      (r): MapPin => ({
        kind: "interaction",
        id: `interaction:${r.id}`,
        interactionId: r.id,
        type: r.type,
        occurredAt: r.occurredAt,
        summary: r.summary,
        location: r.location,
        participants: participants.get(r.id) ?? [],
        coordinates: toCoordinates(r.lat, r.lng, r.radiusM)!,
      }),
    ),
  ];
  return { items, counts: { contacts: methodRows.length, interactions: interactionRows.length } };
}
