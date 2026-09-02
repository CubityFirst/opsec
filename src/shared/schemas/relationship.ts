import { z } from "zod";
import { idSchema, isoDateSchema, nonBlank, optionalText } from "./common";

export const relationshipCreateSchema = z
  .object({
    fromContactId: idSchema,
    toContactId: idSchema,
    typeKey: nonBlank(50),
    label: optionalText(200),
    notes: optionalText(5000),
    startedAt: isoDateSchema.nullish().transform((v) => v ?? null),
    endedAt: isoDateSchema.nullish().transform((v) => v ?? null),
  })
  .refine((v) => v.fromContactId !== v.toContactId, {
    message: "A contact cannot be related to itself",
    path: ["toContactId"],
  });
export type RelationshipCreateInput = z.infer<typeof relationshipCreateSchema>;

export const relationshipUpdateSchema = z
  .object({
    typeKey: nonBlank(50),
    label: optionalText(200),
    notes: optionalText(5000),
    startedAt: isoDateSchema.nullish().transform((v) => v ?? null),
    endedAt: isoDateSchema.nullish().transform((v) => v ?? null),
  })
  .partial();
export type RelationshipUpdateInput = z.infer<typeof relationshipUpdateSchema>;
