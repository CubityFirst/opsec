import { z } from "zod";
import { isoDateSchema, nonBlank, optionalText } from "./common";

export const BET_OUTCOMES = ["me", "them", "void"] as const;
export const betOutcomeSchema = z.enum(BET_OUTCOMES);
export type BetOutcome = z.infer<typeof betOutcomeSchema>;

export const BET_OUTCOME_LABELS: Record<BetOutcome, string> = {
  me: "I was right",
  them: "They were right",
  void: "Void",
};

export const BET_STATUSES = ["open", "settled"] as const;
export const betStatusSchema = z.enum(BET_STATUSES);
export type BetStatus = z.infer<typeof betStatusSchema>;

export const betCreateSchema = z.object({
  /** The user's call, e.g. "Jo will get more than 10,000 votes" or "It won't rain on the wedding day". */
  prediction: nonBlank(500),
  /** What is at stake: "£10", "a pint", "loser buys dinner". */
  wager: optionalText(200),
  /** Day the bet was made; defaults to today. */
  madeOn: isoDateSchema.optional(),
  /** Day to check the result. */
  reviewOn: isoDateSchema,
  details: optionalText(20_000),
});
export type BetCreateInput = z.infer<typeof betCreateSchema>;

export const betUpdateSchema = betCreateSchema.partial();
export type BetUpdateInput = z.infer<typeof betUpdateSchema>;

export const betSettleSchema = z.object({
  outcome: betOutcomeSchema,
  /** How it actually fell. */
  note: optionalText(5000),
});
export type BetSettleInput = z.infer<typeof betSettleSchema>;

export const betListQuerySchema = z.object({
  status: betStatusSchema.optional(),
  /** Only open bets whose review date is on or before this day (YYYY-MM-DD). */
  dueBy: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type BetListQuery = z.infer<typeof betListQuerySchema>;
