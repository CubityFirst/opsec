import { and, desc, eq } from "drizzle-orm";
import { plainMentions } from "@shared/mentions";
import {
  ASK_CONVERSATION_TITLE_CHARS,
  ASK_CONVERSATIONS_LISTED,
  type AskConversationOut,
  type AskConversationSummary,
  type AskStoredTurn,
} from "@shared/schemas/ask";
import { schema, type Db } from "../../db";
import type { AskConversationRow } from "../../db/schema";
import { newId } from "../../lib/ids";
import type { SessionUser } from "../../lib/session";
import { nowIso } from "../../lib/time";
import { ensureUserRow } from "../tokens";

const { askConversations } = schema;

/** The first question, on one line, mentions as plain "@Name". */
export function conversationTitle(turns: AskStoredTurn[]): string {
  const first = turns.find((t) => t.role === "user" && t.text.trim());
  const text = plainMentions(first?.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "Untitled";
  return text.length > ASK_CONVERSATION_TITLE_CHARS ? `${text.slice(0, ASK_CONVERSATION_TITLE_CHARS - 1).trimEnd()}…` : text;
}

function toSummary(r: Pick<AskConversationRow, "id" | "title" | "createdAt" | "updatedAt">): AskConversationSummary {
  return { id: r.id, title: r.title, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

export async function listConversations(db: Db, sub: string): Promise<AskConversationSummary[]> {
  const rows = await db
    .select({ id: askConversations.id, title: askConversations.title, createdAt: askConversations.createdAt, updatedAt: askConversations.updatedAt })
    .from(askConversations)
    .where(eq(askConversations.sub, sub))
    .orderBy(desc(askConversations.updatedAt), desc(askConversations.id))
    .limit(ASK_CONVERSATIONS_LISTED);
  return rows.map(toSummary);
}

export async function getConversation(db: Db, sub: string, id: string): Promise<AskConversationOut | null> {
  const row = await db.select().from(askConversations).where(and(eq(askConversations.id, id), eq(askConversations.sub, sub))).get();
  return row ? { ...toSummary(row), turns: row.turns as AskStoredTurn[] } : null;
}

export async function createConversation(db: Db, user: SessionUser, turns: AskStoredTurn[]): Promise<AskConversationSummary> {
  const now = nowIso();
  const row: AskConversationRow = { id: newId(), sub: user.sub, title: conversationTitle(turns), turns, createdAt: now, updatedAt: now };
  await ensureUserRow(db, user, now);
  await db.insert(askConversations).values(row);
  return toSummary(row);
}

/** Replaces the whole transcript; the title follows the first question. */
export async function saveConversation(db: Db, sub: string, id: string, turns: AskStoredTurn[]): Promise<AskConversationSummary | null> {
  const set = { title: conversationTitle(turns), turns, updatedAt: nowIso() };
  const row = await db
    .update(askConversations)
    .set(set)
    .where(and(eq(askConversations.id, id), eq(askConversations.sub, sub)))
    .returning({ id: askConversations.id, title: askConversations.title, createdAt: askConversations.createdAt, updatedAt: askConversations.updatedAt })
    .get();
  return row ? toSummary(row) : null;
}

export async function deleteConversation(db: Db, sub: string, id: string): Promise<boolean> {
  const rows = await db.delete(askConversations).where(and(eq(askConversations.id, id), eq(askConversations.sub, sub))).returning({ id: askConversations.id });
  return rows.length > 0;
}
