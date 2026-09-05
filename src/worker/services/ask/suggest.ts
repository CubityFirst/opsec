import { z } from "zod";
import { ASK_MAX_SUGGESTIONS, ASK_SUGGESTION_MAX_CHARS } from "@shared/schemas/ask";
import { AskToolError, def } from "./tool-def";

export const SUGGEST_REPLIES = "suggest_replies";

export const suggestRepliesSchema = z.object({
  question: z
    .string()
    .trim()
    .max(500)
    .optional()
    .describe("The question, only if you could not write it as ordinary message text alongside this call"),
  // Lenient on purpose (blanks, duplicates and a few extras are dropped by cleanReplies) so a slightly sloppy call still yields chips.
  replies: z
    .array(z.string().max(ASK_SUGGESTION_MAX_CHARS))
    .min(1)
    .max(ASK_MAX_SUGGESTIONS * 2)
    .describe("1-4 short, plausible answers in the user's voice, most likely first"),
});
export type SuggestReplies = z.infer<typeof suggestRepliesSchema>;

/**
 * Offers quick-reply buttons under a question. Not a lookup: the run loop
 * intercepts it when it is the only call in the model's final message and ends
 * the turn there (see run.ts). If the model mixes it with real tool calls the
 * suggestions would sit above an answer that has not been written yet, so this
 * fallback discards them and tells the model to ask again at the end.
 */
export const suggestReplies = def({
  name: SUGGEST_REPLIES,
  description:
    "Offer the user a few one-tap replies to a question you are asking (e.g. whether to create a contact that does not exist, which of several matching contacts they meant, or what to do next). Call it in your FINAL message, together with the question and with no other tool calls. Pass 1-4 short answers in the user's voice, most likely first; the user can always type something else instead.",
  schema: suggestRepliesSchema,
  label: () => "Offering quick replies",
  run: async () => {
    throw new AskToolError(
      "Suggestions discarded: suggest_replies must be the only tool call in your final message. Finish your lookups, then ask the question and call suggest_replies again.",
    );
  },
});

/** Dedupe and drop blanks; returns null when nothing usable is left. */
export function cleanReplies(replies: string[]): string[] | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of replies) {
    const key = r.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r.trim());
  }
  return out.length ? out.slice(0, ASK_MAX_SUGGESTIONS) : null;
}
