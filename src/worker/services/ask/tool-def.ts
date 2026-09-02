import type { z } from "zod";
import type { AskEvent } from "@shared/schemas/ask";
import type { ContactRef } from "@shared/types";
import type { Db } from "../../db";
import type { ByteBudget } from "./limits";

/** A contact proposed (not yet created) earlier in this request; `ref.id` is its `new:<proposalId>` placeholder. */
export interface PendingContact {
  proposalId: string;
  ref: ContactRef;
}

export interface ToolCtx {
  db: Db;
  emit: (e: AskEvent) => void;
  budget: ByteBudget;
  /** Placeholder id → pending contact, so later proposals in the same reply can chain on a create. */
  pending: Map<string, PendingContact>;
}

/** A tool-level failure reported back to the model (never thrown out of executeTool). */
export class AskToolError extends Error {}

export interface ToolDef<S extends z.ZodObject> {
  name: string;
  description: string;
  schema: S;
  /** Human line for the "investigating…" trail. */
  label: (input: z.infer<S>) => string;
  run: (input: z.infer<S>, ctx: ToolCtx) => Promise<unknown>;
}

export function def<S extends z.ZodObject>(t: ToolDef<S>): ToolDef<z.ZodObject> {
  return t as unknown as ToolDef<z.ZodObject>;
}
