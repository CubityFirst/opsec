import type { ActivityEvent, ActivityEventType, ActivityPayloadFor } from "@shared/schemas/activity";
import type { EntityType } from "@shared/schemas/common";
import type { ActivityEventOut } from "@shared/types";
import { schema, type Db } from "../db";
import type { ActivityRow } from "../db/schema";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";

export interface ActivityInput<T extends ActivityEventType = ActivityEventType> {
  contactId: string;
  entityType: EntityType;
  entityId: string;
  eventType: T;
  payload: ActivityPayloadFor<T>;
  actor?: string;
}

/**
 * Build the insert statement for one or more activity events. This is the only
 * code path that writes to `activity`; callers add the returned statement to a
 * `db.batch` alongside the change it describes so the log never drifts from
 * the data.
 */
/** Distributive union so an `ActivityInput<"x">` is assignable to the list type. */
export type AnyActivityInput = { [K in ActivityEventType]: ActivityInput<K> }[ActivityEventType];

/** Each activity row binds 8 parameters; D1 allows 100 per statement. */
const ACTIVITY_ROWS_PER_STATEMENT = 12;

export function activityInserts(db: Db, events: AnyActivityInput[], actor = "user") {
  const createdAt = nowIso();
  const rows = events.map((e) => ({
    id: newId(),
    contactId: e.contactId,
    entityType: e.entityType,
    entityId: e.entityId,
    eventType: e.eventType,
    actor: e.actor ?? actor,
    payload: e.payload as Record<string, unknown>,
    createdAt,
  }));
  const stmts = [];
  for (let i = 0; i < rows.length; i += ACTIVITY_ROWS_PER_STATEMENT) {
    stmts.push(db.insert(schema.activity).values(rows.slice(i, i + ACTIVITY_ROWS_PER_STATEMENT)));
  }
  return stmts;
}

/** Convenience for a typed event literal. */
export function event<T extends ActivityEventType>(
  contactId: string,
  entityType: EntityType,
  entityId: string,
  eventType: T,
  payload: ActivityPayloadFor<T>,
): ActivityInput<T> {
  return { contactId, entityType, entityId, eventType, payload };
}

export function toActivityOut(row: ActivityRow): ActivityEventOut {
  return {
    id: row.id,
    contactId: row.contactId,
    entityType: row.entityType,
    entityId: row.entityId,
    eventType: row.eventType as ActivityEvent["eventType"],
    actor: row.actor,
    payload: row.payload,
    createdAt: row.createdAt,
  };
}

/** Compute `{ field: { from, to } }` for the keys of `patch` that differ from `before`. */
export function diffChanges<T extends Record<string, unknown>>(before: T, patch: Partial<T>): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const to = patch[key];
    if (to === undefined) continue;
    const from = before[key];
    if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) {
      changes[key as string] = { from: from ?? null, to: to ?? null };
    }
  }
  return changes;
}
