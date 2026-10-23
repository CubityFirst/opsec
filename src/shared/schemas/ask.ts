import { z } from "zod";
import type { ContactRef } from "../types";
import { nonBlank } from "./common";
import type { InteractionCreateInput } from "./interaction";

export const ASK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Long edge the client downscales to before upload. */
export const ASK_IMAGE_MAX_EDGE = 1568;
export const ASK_MAX_HISTORY_TURNS = 40;
/** Quick replies the assistant may offer under a question (`suggest_replies`). */
export const ASK_MAX_SUGGESTIONS = 4;
export const ASK_SUGGESTION_MAX_CHARS = 80;

export const askImageSchema = z.object({
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  /** base64 without the data: prefix; ≈ 4/3 × 5 MB. */
  data: z.string().min(1).max(7_000_000),
});
export type AskImage = z.infer<typeof askImageSchema>;

export const askTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(20_000),
  /** A user turn that carried an image. Only the latest question resends the image itself; this keeps the model aware it existed. */
  image: z.boolean().optional(),
});
export type AskTurn = z.infer<typeof askTurnSchema>;

/** True when `Intl` knows the IANA zone name (e.g. "Europe/London"). */
export function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}
/** IANA zone name; the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`. */
export const timeZoneSchema = z.string().trim().min(1).max(64).refine(isTimeZone, "Unknown time zone");

export const askRequestSchema = z.object({
  /** Prior turns, text only, oldest first. */
  messages: z.array(askTurnSchema).max(ASK_MAX_HISTORY_TURNS).default([]),
  question: nonBlank(4_000),
  image: askImageSchema.optional(),
  /** Where the user is, so "9am" means 9am there. Falls back to the `TIMEZONE` var, then UTC. */
  timeZone: timeZoneSchema.optional(),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

/** An action the assistant suggests; nothing is written until the user applies it. */
export type AskProposal =
  | {
      kind: "interaction";
      id: string;
      input: InteractionCreateInput;
      participants: ContactRef[];
      dependsOn?: string[];
      /** Attach the most recent image the user sent in the conversation (the SPA holds it; the server never stores Ask images). */
      attachImage?: boolean;
    }
  | { kind: "contact_note"; id: string; contact: ContactRef; appendText: string }
  | {
      /** Any other change: the card shows before/after rows and Apply sends `request` as-is. */
      kind: "action";
      id: string;
      title: string;
      contact: ContactRef | null;
      changes: { label: string; from: string | null; to: string | null }[];
      request: { method: "POST" | "PATCH" | "PUT" | "DELETE"; path: string; body?: unknown };
      /** Deletes and archives: the Apply button is styled as destructive. */
      destructive?: boolean;
      /** Proposals (by id) that must be applied first; their created ids replace `new:<id>` placeholders in `request`. */
      dependsOn?: string[];
    };

/**
 * Placeholder id for a contact that a propose_contact_create proposal will
 * create: `new:<proposalId>`. Later proposals in the same reply may use it
 * wherever a contact id is expected; the browser substitutes the real id once
 * the create has been applied.
 */
export const PENDING_ID_PREFIX = "new:";
export const pendingIdFor = (proposalId: string): string => `${PENDING_ID_PREFIX}${proposalId}`;
export const isPendingId = (id: string): boolean => id.startsWith(PENDING_ID_PREFIX);
export const pendingProposalId = (id: string): string => id.slice(PENDING_ID_PREFIX.length);

export type AskStop = "end_turn" | "max_tokens" | "max_iterations" | "budget" | "refusal" | "aborted";

/** Server → browser events on the /api/ask stream, one JSON object per SSE `data:` line. */
export type AskEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; label: string; input: unknown }
  | { type: "tool_result"; id: string; ok: boolean; summary: string; bytes: number }
  | { type: "proposal"; proposal: AskProposal }
  /** Quick replies for the question just asked; picking one sends it as the next user message. */
  | { type: "suggestions"; replies: string[] }
  | { type: "done"; stop: AskStop; iterations: number; usage: { input: number; output: number; cached?: number } }
  | { type: "error"; code: string; message: string };

export interface AskConfig {
  label: string;
  model: string;
}

/**
 * Saved conversations (the Ask sidebar). The browser stores the transcript as
 * it renders it: tool trail, proposals with whether they were applied, quick
 * replies. Images are never stored; a user turn keeps only `image: true`.
 */
export const ASK_CONVERSATION_MAX_TURNS = 400;
/** Serialised size of one transcript; D1 caps a value at 2 MB. */
export const ASK_CONVERSATION_MAX_CHARS = 1_500_000;
export const ASK_CONVERSATION_TITLE_CHARS = 80;
/** How many of the most recently updated conversations the sidebar lists. */
export const ASK_CONVERSATIONS_LISTED = 100;

const storedTrailItemSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(200),
  label: z.string().max(2_000),
  input: z.unknown(),
  ok: z.boolean().optional(),
  summary: z.string().max(2_000).optional(),
});

export const askStoredTurnSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), text: z.string().max(20_000), image: z.boolean().optional() }),
  z.object({
    role: z.literal("assistant"),
    text: z.string().max(200_000),
    trail: z.array(storedTrailItemSchema).max(500),
    /** AskProposal plus the applied / dismissed / result marks; only the envelope is checked, the rest is the browser's own record. */
    proposals: z.array(z.looseObject({ id: z.string().max(200), kind: z.enum(["interaction", "contact_note", "action"]) })).max(200),
    suggestions: z.array(z.string().max(ASK_SUGGESTION_MAX_CHARS)).max(ASK_MAX_SUGGESTIONS).optional(),
    done: z.object({ stop: z.enum(["end_turn", "max_tokens", "max_iterations", "budget", "refusal", "aborted"]), iterations: z.number().int().nonnegative() }).optional(),
    error: z.string().max(2_000).optional(),
  }),
]);
export type AskStoredTurn = z.infer<typeof askStoredTurnSchema>;

export const askConversationSaveSchema = z.object({
  turns: z
    .array(askStoredTurnSchema)
    .min(1)
    .max(ASK_CONVERSATION_MAX_TURNS)
    .refine((t) => t.some((x) => x.role === "user" && x.text.trim()), "A conversation needs a question")
    .refine((t) => JSON.stringify(t).length <= ASK_CONVERSATION_MAX_CHARS, "This conversation is too long to save; start a new one"),
});
export type AskConversationSaveInput = z.infer<typeof askConversationSaveSchema>;

export interface AskConversationSummary {
  id: string;
  /** The first question, mentions as plain "@Name", cut to ASK_CONVERSATION_TITLE_CHARS. */
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AskConversationOut extends AskConversationSummary {
  turns: AskStoredTurn[];
}
