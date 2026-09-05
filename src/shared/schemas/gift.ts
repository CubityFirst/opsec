import { z } from "zod";
import { isoDateSchema, nonBlank, optionalText } from "./common";

/**
 * idea = something the user might give this contact one day;
 * given = the user gave it to the contact; received = the contact gave it to the user.
 */
export const GIFT_STATUSES = ["idea", "given", "received"] as const;
export const giftStatusSchema = z.enum(GIFT_STATUSES);
export type GiftStatus = z.infer<typeof giftStatusSchema>;

export const GIFT_STATUS_LABELS: Record<GiftStatus, string> = {
  idea: "Idea",
  given: "Given",
  received: "Received",
};

export const giftCreateSchema = z.object({
  /** What the gift is: "Bottle of Islay whisky", "Tickets to the Globe". */
  name: nonBlank(200),
  status: giftStatusSchema,
  /** "40th birthday", "Christmas 2026", "housewarming". */
  occasion: optionalText(200),
  /** Day it changed hands (given / received). Ignored for ideas; defaults to today otherwise. */
  givenOn: isoDateSchema.nullish(),
  /** Free text: "£40", "about $100". */
  price: optionalText(100),
  /** Where to buy it, for ideas mostly. */
  url: optionalText(2000),
  notes: optionalText(20_000),
});
export type GiftCreateInput = z.infer<typeof giftCreateSchema>;

export const giftUpdateSchema = giftCreateSchema.partial();
export type GiftUpdateInput = z.infer<typeof giftUpdateSchema>;

/** Turn an idea into a gift that has been given. */
export const giftGiveSchema = z.object({
  /** Defaults to today. */
  on: isoDateSchema.optional(),
  /** Omitted = keep what the idea had; empty or null = clear. */
  occasion: z.string().trim().max(200).nullish(),
  price: z.string().trim().max(100).nullish(),
});
export type GiftGiveInput = z.infer<typeof giftGiveSchema>;

export const giftListQuerySchema = z.object({
  status: giftStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type GiftListQuery = z.infer<typeof giftListQuerySchema>;
