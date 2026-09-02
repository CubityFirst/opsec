import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { RelationshipOut } from "@shared/types";
import { schema, type Db } from "../db";
import { toContactRef } from "./contacts";

const { contacts, relationships, relationshipTypes } = schema;

const CATEGORY_ORDER = ["family", "pet", "social", "group", "work", "care", "other"];

/**
 * Relationships of a contact, normalised to that contact's perspective. A
 * stored row means "from is the <type> of to"; each item describes the OTHER
 * contact's role, so outgoing rows show the inverse type and incoming rows the
 * type itself. Sorted by category, then role, then name.
 */
export async function listRelationshipsFor(db: Db, id: string): Promise<RelationshipOut[]> {
  const inv = alias(relationshipTypes, "inv");

  const outgoing = await db
    .select({ rel: relationships, other: contacts, type: inv })
    .from(relationships)
    .innerJoin(contacts, eq(contacts.id, relationships.toContactId))
    .innerJoin(relationshipTypes, eq(relationshipTypes.key, relationships.typeKey))
    .innerJoin(inv, eq(inv.key, relationshipTypes.inverseKey))
    .where(eq(relationships.fromContactId, id));

  const incoming = await db
    .select({ rel: relationships, other: contacts, type: relationshipTypes })
    .from(relationships)
    .innerJoin(contacts, eq(contacts.id, relationships.fromContactId))
    .innerJoin(relationshipTypes, eq(relationshipTypes.key, relationships.typeKey))
    .where(eq(relationships.toContactId, id));

  const items: RelationshipOut[] = [
    ...outgoing.map((r) => ({ ...r, direction: "outgoing" as const })),
    ...incoming.map((r) => ({ ...r, direction: "incoming" as const })),
  ].map(({ rel, other, type, direction }) => ({
    id: rel.id,
    otherContact: toContactRef(other),
    typeKey: type.key,
    typeLabel: type.label,
    category: type.category,
    direction,
    label: rel.label,
    notes: rel.notes,
    startedAt: rel.startedAt,
    endedAt: rel.endedAt,
    createdAt: rel.createdAt,
    updatedAt: rel.updatedAt,
  }));
  items.sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.typeLabel.localeCompare(b.typeLabel) ||
      a.otherContact.displayName.localeCompare(b.otherContact.displayName),
  );
  return items;
}
