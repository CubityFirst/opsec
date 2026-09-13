import { z } from "zod";
import { daysBetween } from "../recurrence";
import { isoDateSchema } from "./common";

/** What the cross-contact timeline can show. */
export const TIMELINE_KINDS = ["interaction", "lifeEvent", "gift", "bet"] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export const TIMELINE_KIND_LABELS: Record<TimelineKind, string> = { interaction: "Interactions", lifeEvent: "Life events", gift: "Gifts", bet: "Bets" };

/** Longest range one request may cover, in days: enough for "this year", small enough to keep the response bounded. */
export const TIMELINE_MAX_DAYS = 400;

export const timelineQuerySchema = z
  .object({
    /** First day, inclusive (YYYY-MM-DD). */
    from: isoDateSchema,
    /** Last day, inclusive (YYYY-MM-DD). */
    to: isoDateSchema,
    /** Comma-separated subset of TIMELINE_KINDS; omitted = everything. */
    kinds: z
      .string()
      .optional()
      .transform((s) => {
        if (!s) return [...TIMELINE_KINDS];
        const wanted = new Set(s.split(","));
        return TIMELINE_KINDS.filter((k) => wanted.has(k));
      }),
  })
  .refine((q) => q.to >= q.from, { path: ["to"], message: "Must not be before `from`" })
  .refine((q) => daysBetween(q.from, q.to) < TIMELINE_MAX_DAYS, { path: ["to"], message: `At most ${TIMELINE_MAX_DAYS} days at a time` });
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
