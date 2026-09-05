import { z } from "zod";
import { contactMethodTypeSchema, interactionTypeSchema } from "./common";
import { lifeEventCategorySchema } from "./life-event";
import { betOutcomeSchema } from "./bet";

/**
 * Versioned payloads for the append-only `activity` log. This union is the
 * contract that future programmatic consumers (exports, digests, parsers)
 * read, so add new variants rather than changing existing ones. Bump `v`
 * inside a variant when its shape changes.
 */
const v1 = z.literal(1);

export const fieldChangeSchema = z.object({ from: z.unknown(), to: z.unknown() });

export const activityEventSchema = z.discriminatedUnion("eventType", [
  z.object({ eventType: z.literal("contact.created"), payload: z.object({ v: v1, kind: z.string(), displayName: z.string() }) }),
  z.object({ eventType: z.literal("contact.updated"), payload: z.object({ v: v1, changes: z.record(z.string(), fieldChangeSchema) }) }),
  z.object({ eventType: z.literal("contact.archived"), payload: z.object({ v: v1 }) }),
  z.object({ eventType: z.literal("contact.unarchived"), payload: z.object({ v: v1 }) }),
  z.object({ eventType: z.literal("contact.deceased"), payload: z.object({ v: v1, on: z.string().nullable() }) }),
  z.object({ eventType: z.literal("contact.undeceased"), payload: z.object({ v: v1 }) }),

  z.object({
    eventType: z.literal("contact_method.added"),
    payload: z.object({ v: v1, type: contactMethodTypeSchema, label: z.string().nullable(), value: z.string() }),
  }),
  z.object({
    eventType: z.literal("contact_method.updated"),
    payload: z.object({ v: v1, type: contactMethodTypeSchema, changes: z.record(z.string(), fieldChangeSchema) }),
  }),
  z.object({
    eventType: z.literal("contact_method.removed"),
    payload: z.object({ v: v1, type: contactMethodTypeSchema, label: z.string().nullable(), value: z.string() }),
  }),

  z.object({ eventType: z.literal("tag.added"), payload: z.object({ v: v1, name: z.string() }) }),
  z.object({ eventType: z.literal("tag.removed"), payload: z.object({ v: v1, name: z.string() }) }),

  z.object({
    eventType: z.literal("relationship.added"),
    payload: z.object({
      v: v1,
      otherContactId: z.string(),
      otherDisplayName: z.string(),
      typeKey: z.string(),
      typeLabel: z.string(),
      direction: z.enum(["outgoing", "incoming"]),
      label: z.string().nullable(),
    }),
  }),
  z.object({
    eventType: z.literal("relationship.updated"),
    payload: z.object({ v: v1, otherContactId: z.string(), otherDisplayName: z.string(), changes: z.record(z.string(), fieldChangeSchema) }),
  }),
  z.object({
    eventType: z.literal("relationship.removed"),
    payload: z.object({ v: v1, otherContactId: z.string(), otherDisplayName: z.string(), typeKey: z.string(), typeLabel: z.string() }),
  }),

  z.object({
    eventType: z.literal("interaction.created"),
    payload: z.object({
      v: v1,
      type: interactionTypeSchema,
      occurredAt: z.string(),
      summary: z.string(),
      participantIds: z.array(z.string()),
    }),
  }),
  z.object({
    eventType: z.literal("interaction.updated"),
    payload: z.object({ v: v1, summary: z.string(), changes: z.record(z.string(), fieldChangeSchema) }),
  }),
  z.object({
    eventType: z.literal("interaction.mentioned"),
    payload: z.object({ v: v1, type: interactionTypeSchema, occurredAt: z.string(), summary: z.string(), participantIds: z.array(z.string()) }),
  }),
  z.object({
    eventType: z.literal("interaction.deleted"),
    payload: z.object({ v: v1, type: interactionTypeSchema, occurredAt: z.string(), summary: z.string() }),
  }),

  z.object({
    eventType: z.literal("life_event.created"),
    payload: z.object({ v: v1, category: lifeEventCategorySchema, title: z.string(), occurredOn: z.string() }),
  }),
  z.object({
    eventType: z.literal("life_event.updated"),
    payload: z.object({ v: v1, title: z.string(), changes: z.record(z.string(), fieldChangeSchema) }),
  }),
  z.object({
    eventType: z.literal("life_event.deleted"),
    payload: z.object({ v: v1, category: lifeEventCategorySchema, title: z.string(), occurredOn: z.string() }),
  }),

  z.object({
    eventType: z.literal("bet.created"),
    payload: z.object({ v: v1, prediction: z.string(), wager: z.string().nullable(), madeOn: z.string(), reviewOn: z.string() }),
  }),
  z.object({
    eventType: z.literal("bet.updated"),
    payload: z.object({ v: v1, prediction: z.string(), changes: z.record(z.string(), fieldChangeSchema) }),
  }),
  z.object({
    eventType: z.literal("bet.settled"),
    payload: z.object({ v: v1, prediction: z.string(), wager: z.string().nullable(), outcome: betOutcomeSchema, note: z.string().nullable() }),
  }),
  z.object({
    eventType: z.literal("bet.reopened"),
    payload: z.object({ v: v1, prediction: z.string(), previousOutcome: betOutcomeSchema }),
  }),
  z.object({
    eventType: z.literal("bet.deleted"),
    payload: z.object({ v: v1, prediction: z.string(), wager: z.string().nullable(), reviewOn: z.string(), outcome: betOutcomeSchema.nullable() }),
  }),

  z.object({
    eventType: z.literal("reminder.created"),
    payload: z.object({ v: v1, title: z.string(), dueOn: z.string(), repeat: z.string().nullable() }),
  }),
  z.object({
    eventType: z.literal("reminder.updated"),
    payload: z.object({ v: v1, title: z.string(), changes: z.record(z.string(), fieldChangeSchema) }),
  }),
  z.object({
    eventType: z.literal("reminder.completed"),
    payload: z.object({ v: v1, title: z.string(), on: z.string(), nextDueOn: z.string().nullable() }),
  }),
  z.object({
    eventType: z.literal("reminder.skipped"),
    payload: z.object({ v: v1, title: z.string(), on: z.string(), nextDueOn: z.string().nullable() }),
  }),
  z.object({
    eventType: z.literal("reminder.reopened"),
    payload: z.object({ v: v1, title: z.string(), dueOn: z.string() }),
  }),
  z.object({
    eventType: z.literal("reminder.deleted"),
    payload: z.object({ v: v1, title: z.string(), dueOn: z.string(), repeat: z.string().nullable() }),
  }),

  z.object({
    eventType: z.literal("file.uploaded"),
    payload: z.object({ v: v1, kind: z.enum(["avatar", "avatar_original", "attachment"]), filename: z.string(), contentType: z.string(), size: z.number() }),
  }),
  z.object({
    eventType: z.literal("file.deleted"),
    payload: z.object({ v: v1, kind: z.enum(["avatar", "avatar_original", "attachment"]), filename: z.string() }),
  }),
]);

export type ActivityEvent = z.infer<typeof activityEventSchema>;
export type ActivityEventType = ActivityEvent["eventType"];
export type ActivityPayloadFor<T extends ActivityEventType> = Extract<ActivityEvent, { eventType: T }>["payload"];
export const ACTIVITY_EVENT_TYPES = activityEventSchema.options.map((o) => o.shape.eventType.value) as ActivityEventType[];
