import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

export const CONTACT_KINDS = ["person", "pet", "organization"] as const;
export const CONTACT_METHOD_TYPES = ["phone", "email", "address", "social", "url", "other"] as const;
export const RELATIONSHIP_CATEGORIES = ["family", "social", "group", "work", "pet", "care", "other"] as const;
export const INTERACTION_TYPES = ["call", "text", "email", "meeting", "meal", "gift", "event", "note", "other"] as const;
export const FILE_KINDS = ["avatar", "avatar_original", "attachment"] as const;
export const ENTITY_TYPES = ["contact", "contact_method", "tag", "relationship", "interaction", "file", "life_event"] as const;
export const LIFE_EVENT_CATEGORIES = ["work_education", "family_relationships", "home_living", "health_wellness", "travel_experiences"] as const;

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: CONTACT_KINDS }).notNull(),
    displayName: text("display_name").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    nickname: text("nickname"),
    /** e.g. "she/her"; people only in the UI. */
    pronouns: text("pronouns"),
    /** Other names this contact goes by: [{ label: "Chinese name", value: "陈伟" }, …]. */
    otherNames: text("other_names", { mode: "json" }).$type<{ label: string; value: string }[]>().notNull().default(sql`'[]'`),
    birthday: text("birthday"),
    /** How we met: partial date (same format as birthday), place, and a short note. */
    metOn: text("met_on"),
    metWhere: text("met_where"),
    metHow: text("met_how"),
    /** Who introduced us / who we know them through. Self-reference; cleared if that contact is deleted. */
    metViaContactId: text("met_via_contact_id").references((): AnySQLiteColumn => contacts.id, { onDelete: "set null" }),
    /** Work: free-text title plus the employer (an organisation contact). Setting the employer maintains the employer ↔ employee relationship. */
    jobTitle: text("job_title"),
    employerContactId: text("employer_contact_id").references((): AnySQLiteColumn => contacts.id, { onDelete: "set null" }),
    notes: text("notes"),
    // Intentionally not an enforced FK: files.contact_id references contacts, so an
    // enforced FK here would be circular.
    avatarFileId: text("avatar_file_id"),
    /** The uncropped upload the avatar was made from; shown full-size on click. */
    avatarOriginalFileId: text("avatar_original_file_id"),
    customFields: text("custom_fields", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    archivedAt: text("archived_at"),
    ...timestamps,
  },
  (t) => [
    index("contacts_kind_idx").on(t.kind),
    index("contacts_display_name_idx").on(t.displayName),
    index("contacts_archived_at_idx").on(t.archivedAt),
  ],
);

export const contactMethods = sqliteTable(
  "contact_methods",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    type: text("type", { enum: CONTACT_METHOD_TYPES }).notNull(),
    label: text("label"),
    value: text("value").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("contact_methods_contact_idx").on(t.contactId), index("contact_methods_value_idx").on(t.value)],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    nameLower: text("name_lower").notNull(),
    color: text("color"),
    ...timestamps,
  },
  (t) => [uniqueIndex("tags_name_lower_unique").on(t.nameLower)],
);

export const contactTags = sqliteTable(
  "contact_tags",
  {
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.tagId] }), index("contact_tags_tag_idx").on(t.tagId)],
);

export const relationshipTypes = sqliteTable("relationship_types", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  inverseKey: text("inverse_key")
    .notNull()
    .references((): AnySQLiteColumn => relationshipTypes.key),
  category: text("category", { enum: RELATIONSHIP_CATEGORIES }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  /** Comma-separated contact kinds allowed as `from` ("X is the <type> of Y": X's kinds). */
  fromKinds: text("from_kinds").notNull().default("person,pet,organization"),
  /** Comma-separated contact kinds allowed as `to`. */
  toKinds: text("to_kinds").notNull().default("person,pet,organization"),
});

export const relationships = sqliteTable(
  "relationships",
  {
    id: text("id").primaryKey(),
    fromContactId: text("from_contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    toContactId: text("to_contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    typeKey: text("type_key")
      .notNull()
      .references(() => relationshipTypes.key),
    label: text("label"),
    notes: text("notes"),
    startedAt: text("started_at"),
    endedAt: text("ended_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("relationships_unique").on(t.fromContactId, t.toContactId, t.typeKey),
    index("relationships_from_idx").on(t.fromContactId),
    index("relationships_to_idx").on(t.toContactId),
    check("relationships_not_self", sql`${t.fromContactId} <> ${t.toContactId}`),
  ],
);

export const interactions = sqliteTable(
  "interactions",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: INTERACTION_TYPES }).notNull(),
    occurredAt: text("occurred_at").notNull(),
    summary: text("summary").notNull(),
    body: text("body"),
    location: text("location"),
    ...timestamps,
  },
  (t) => [index("interactions_occurred_at_idx").on(t.occurredAt)],
);

export const interactionContacts = sqliteTable(
  "interaction_contacts",
  {
    interactionId: text("interaction_id")
      .notNull()
      .references(() => interactions.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    role: text("role"),
  },
  (t) => [
    primaryKey({ columns: [t.interactionId, t.contactId] }),
    index("interaction_contacts_contact_idx").on(t.contactId, t.interactionId),
  ],
);

/** Milestones in a contact's life: a new job, a move, a wedding, a trip. Shown in their feed at `occurred_on`. */
export const lifeEvents = sqliteTable(
  "life_events",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    category: text("category", { enum: LIFE_EVENT_CATEGORIES }).notNull(),
    title: text("title").notNull(),
    /** Partial date, same format as contacts.birthday. */
    occurredOn: text("occurred_on").notNull(),
    body: text("body"),
    ...timestamps,
  },
  (t) => [index("life_events_contact_idx").on(t.contactId, t.occurredOn)],
);

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: FILE_KINDS }).notNull(),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    interactionId: text("interaction_id").references(() => interactions.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("files_r2_key_unique").on(t.r2Key),
    index("files_contact_idx").on(t.contactId),
    index("files_interaction_idx").on(t.interactionId),
  ],
);

export const activity = sqliteTable(
  "activity",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    entityType: text("entity_type", { enum: ENTITY_TYPES }).notNull(),
    entityId: text("entity_id").notNull(),
    eventType: text("event_type").notNull(),
    actor: text("actor").notNull().default("user"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("activity_contact_created_idx").on(t.contactId, t.createdAt),
    index("activity_created_idx").on(t.createdAt),
    index("activity_entity_idx").on(t.entityType, t.entityId),
  ],
);

/** App-wide settings (single tenant), one JSON document per key. Secret-bearing values are encrypted by lib/crypto.ts before storage. */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Signed-in identities, keyed on the OIDC `sub` claim (never on email). */
export const users = sqliteTable("users", {
  sub: text("sub").primaryKey(),
  email: text("email"),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  name: text("name"),
  picture: text("picture"),
  roles: text("roles", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  /** Per-user UI preferences; see `userPreferencesSchema` in src/shared for the shape. */
  preferences: text("preferences", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  createdAt: text("created_at").notNull(),
  lastLoginAt: text("last_login_at").notNull(),
});

export type ContactRow = typeof contacts.$inferSelect;
export type ContactMethodRow = typeof contactMethods.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type RelationshipTypeRow = typeof relationshipTypes.$inferSelect;
export type RelationshipRow = typeof relationships.$inferSelect;
export type InteractionRow = typeof interactions.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type ActivityRow = typeof activity.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type LifeEventRow = typeof lifeEvents.$inferSelect;
