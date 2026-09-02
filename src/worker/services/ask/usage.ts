import { eq, and, sql } from "drizzle-orm";
import { schema, type Db } from "../../db";
import { ApiError } from "../../lib/errors";
import { nowIso } from "../../lib/time";

/**
 * Per-user, per-UTC-day Ask spend guard. Bounds the damage of a runaway client
 * (a retry loop, a stuck tab) regardless of what the provider charges: once the
 * day's request or token allowance is used, /api/ask answers 429 until midnight UTC.
 */
export interface AskBudget {
  /** Requests per user per day (counted when a request starts, so failures count too). */
  requestsPerDay: number;
  /** Input + output tokens per user per day, as reported by the provider. */
  tokensPerDay: number;
}

export const DEFAULT_ASK_BUDGET: AskBudget = { requestsPerDay: 200, tokensPerDay: 1_000_000 };

type BudgetEnv = { ASK_DAILY_REQUEST_LIMIT?: string; ASK_DAILY_TOKEN_BUDGET?: string };

export function askBudget(env: BudgetEnv): AskBudget {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
  };
  return { requestsPerDay: num(env.ASK_DAILY_REQUEST_LIMIT, DEFAULT_ASK_BUDGET.requestsPerDay), tokensPerDay: num(env.ASK_DAILY_TOKEN_BUDGET, DEFAULT_ASK_BUDGET.tokensPerDay) };
}

export const dayKey = (now = new Date()): string => now.toISOString().slice(0, 10);

export interface AskUsageOut {
  day: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  budget: AskBudget;
}

export async function getAskUsage(db: Db, sub: string, budget: AskBudget, day = dayKey()): Promise<AskUsageOut> {
  const row = await db
    .select()
    .from(schema.askUsage)
    .where(and(eq(schema.askUsage.sub, sub), eq(schema.askUsage.day, day)))
    .get();
  return { day, requests: row?.requests ?? 0, inputTokens: row?.inputTokens ?? 0, outputTokens: row?.outputTokens ?? 0, budget };
}

/** Throws 429 `budget_exceeded` when today's allowance is used up. */
export async function assertWithinAskBudget(db: Db, sub: string, budget: AskBudget, day = dayKey()): Promise<AskUsageOut> {
  const u = await getAskUsage(db, sub, budget, day);
  if (u.requests >= budget.requestsPerDay) throw new ApiError(429, "budget_exceeded", `Daily Ask limit reached (${budget.requestsPerDay} questions). It resets at midnight UTC.`);
  if (u.inputTokens + u.outputTokens >= budget.tokensPerDay) throw new ApiError(429, "budget_exceeded", `Daily Ask token budget reached (${budget.tokensPerDay.toLocaleString("en-GB")} tokens). It resets at midnight UTC.`);
  return u;
}

/** Add to today's counters (upsert). */
export async function recordAskUsage(db: Db, sub: string, delta: { requests?: number; inputTokens?: number; outputTokens?: number }, day = dayKey()): Promise<void> {
  const now = nowIso();
  const requests = delta.requests ?? 0;
  const inputTokens = delta.inputTokens ?? 0;
  const outputTokens = delta.outputTokens ?? 0;
  await db
    .insert(schema.askUsage)
    .values({ sub, day, requests, inputTokens, outputTokens, updatedAt: now })
    .onConflictDoUpdate({
      target: [schema.askUsage.sub, schema.askUsage.day],
      set: {
        requests: sql`${schema.askUsage.requests} + ${requests}`,
        inputTokens: sql`${schema.askUsage.inputTokens} + ${inputTokens}`,
        outputTokens: sql`${schema.askUsage.outputTokens} + ${outputTokens}`,
        updatedAt: now,
      },
    });
}
