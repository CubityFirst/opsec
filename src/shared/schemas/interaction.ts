import { z } from "zod";
import { idSchema, interactionTypeSchema, isoDateTimeSchema, nonBlank, optionalText, paginationSchema } from "./common";

export const interactionCreateSchema = z.object({
  type: interactionTypeSchema,
  occurredAt: isoDateTimeSchema,
  summary: nonBlank(500),
  body: optionalText(50_000),
  location: optionalText(500),
  contactIds: z.array(idSchema).min(1).max(50),
});
export type InteractionCreateInput = z.infer<typeof interactionCreateSchema>;

export const interactionUpdateSchema = interactionCreateSchema.partial();
export type InteractionUpdateInput = z.infer<typeof interactionUpdateSchema>;

export const interactionListQuerySchema = paginationSchema.extend({
  since: isoDateTimeSchema.optional(),
  type: interactionTypeSchema.optional(),
});
export type InteractionListQuery = z.infer<typeof interactionListQuerySchema>;

export const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  before: isoDateTimeSchema.optional(),
});
export type FeedQuery = z.infer<typeof feedQuerySchema>;

export const activityLogQuerySchema = z.object({
  since: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  eventType: z.string().max(64).optional(),
});
export type ActivityLogQuery = z.infer<typeof activityLogQuerySchema>;
