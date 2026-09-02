import { z } from "zod";
import type { ContactRef } from "../types";
import { nonBlank } from "./common";
import type { InteractionCreateInput } from "./interaction";

export const ASK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Long edge the client downscales to before upload. */
export const ASK_IMAGE_MAX_EDGE = 1568;
export const ASK_MAX_HISTORY_TURNS = 40;

export const askImageSchema = z.object({
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  /** base64 without the data: prefix; ≈ 4/3 × 5 MB. */
  data: z.string().min(1).max(7_000_000),
});
export type AskImage = z.infer<typeof askImageSchema>;

export const askTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(20_000),
});
export type AskTurn = z.infer<typeof askTurnSchema>;

export const askRequestSchema = z.object({
  /** Prior turns, text only, oldest first. */
  messages: z.array(askTurnSchema).max(ASK_MAX_HISTORY_TURNS).default([]),
  question: nonBlank(4_000),
  image: askImageSchema.optional(),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

/** An action the assistant suggests; nothing is written until the user applies it. */
export type AskProposal =
  | { kind: "interaction"; id: string; input: InteractionCreateInput; participants: ContactRef[]; dependsOn?: string[] }
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
  | { type: "done"; stop: AskStop; iterations: number; usage: { input: number; output: number } }
  | { type: "error"; code: string; message: string };

export interface AskUsage {
  day: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  budget: { requestsPerDay: number; tokensPerDay: number };
}

export interface AskConfig {
  label: string;
  model: string;
}
