import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { askRequestSchema, type AskEvent } from "@shared/schemas/ask";
import type { AppEnv } from "../env";
import { ApiError, validationHook } from "../lib/errors";
import { resolveProvider } from "../services/ai-settings";
import { askConfig, createAskClient } from "../services/ask/client";
import { classifyAskError } from "../services/ask/errors";
import { testFetch } from "../services/ask/provider";
import { runAsk } from "../services/ask/run";
import { askBudget, assertWithinAskBudget, getAskUsage, recordAskUsage } from "../services/ask/usage";

const app = new Hono<AppEnv>();

app.get("/ask/config", async (c) => {
  const { provider } = await resolveProvider(c.get("db"), c.env);
  return c.json(askConfig(provider));
});

/** Today's Ask counters for the signed-in user, with the daily allowance. */
app.get("/ask/usage", async (c) => {
  const user = c.get("user");
  if (!user) throw ApiError.unauthorized();
  return c.json(await getAskUsage(c.get("db"), user.sub, askBudget(c.env)));
});

/**
 * Streams the answer as server-sent events. Validation and auth errors are
 * ordinary JSON responses before the stream starts; anything after that
 * arrives as an `error` event.
 */
app.post("/ask", zValidator("json", askRequestSchema, validationHook), async (c) => {
  const input = c.req.valid("json");
  const db = c.get("db");
  const user = c.get("user");
  if (!user) throw ApiError.unauthorized();
  const { provider } = await resolveProvider(db, c.env);
  if (!provider.baseUrl || !provider.model) throw new ApiError(503, "internal", "Ask is not configured (no base URL / model)");
  // Spend guard: refuse before any provider call, and count the request now so failures count too.
  await assertWithinAskBudget(db, user.sub, askBudget(c.env));
  await recordAskUsage(db, user.sub, { requests: 1 });

  c.header("Cache-Control", "no-store");
  c.header("X-Accel-Buffering", "no");
  return streamSSE(c, async (stream) => {
    const ctrl = new AbortController();
    stream.onAbort(() => ctrl.abort());
    const emit = (e: AskEvent) => stream.writeSSE({ data: JSON.stringify(e) });
    const started = Date.now();
    try {
      const client = createAskClient(provider, testFetch(c.env));
      const result = await runAsk({ db, provider, client, user, input, emit, signal: ctrl.signal });
      await recordAskUsage(db, user.sub, { inputTokens: result.usage.input, outputTokens: result.usage.output });
      console.log(JSON.stringify({ route: "ask", sub: user.sub, ...result, ms: Date.now() - started }));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const { code, message } = classifyAskError(err);
      console.error(JSON.stringify({ route: "ask", sub: user.sub, error: code, detail: message, ms: Date.now() - started }));
      await emit({ type: "error", code, message });
    }
  });
});

export default app;
