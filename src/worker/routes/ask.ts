import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { askConversationSaveSchema, askRequestSchema, type AskEvent } from "@shared/schemas/ask";
import type { AppEnv } from "../env";
import { ApiError, validationHook } from "../lib/errors";
import { resolveProvider } from "../services/ai-settings";
import { askConfig, createAskClient } from "../services/ask/client";
import { createConversation, deleteConversation, getConversation, listConversations, saveConversation } from "../services/ask/conversations";
import { classifyAskError } from "../services/ask/errors";
import { deploymentTimeZone } from "../services/ask/prompt";
import { testFetch } from "../services/ask/provider";
import { runAsk } from "../services/ask/run";

const app = new Hono<AppEnv>();

app.get("/ask/config", async (c) => {
  const { provider } = await resolveProvider(c.get("db"), c.env);
  return c.json(askConfig(provider));
});

function subOf(user: AppEnv["Variables"]["user"]): string {
  if (!user) throw ApiError.unauthorized();
  return user.sub;
}

/** Saved conversations for the sidebar; each user sees only their own. The browser writes the whole transcript after every turn. */
app.get("/ask/conversations", async (c) => c.json({ items: await listConversations(c.get("db"), subOf(c.get("user"))) }));

app.get("/ask/conversations/:id", async (c) => {
  const out = await getConversation(c.get("db"), subOf(c.get("user")), c.req.param("id"));
  if (!out) throw ApiError.notFound("Conversation");
  return c.json(out);
});

app.post("/ask/conversations", zValidator("json", askConversationSaveSchema, validationHook), async (c) => {
  const user = c.get("user");
  if (!user) throw ApiError.unauthorized();
  return c.json(await createConversation(c.get("db"), user, c.req.valid("json").turns), 201);
});

app.put("/ask/conversations/:id", zValidator("json", askConversationSaveSchema, validationHook), async (c) => {
  const out = await saveConversation(c.get("db"), subOf(c.get("user")), c.req.param("id"), c.req.valid("json").turns);
  if (!out) throw ApiError.notFound("Conversation");
  return c.json(out);
});

app.delete("/ask/conversations/:id", async (c) => {
  if (!(await deleteConversation(c.get("db"), subOf(c.get("user")), c.req.param("id")))) throw ApiError.notFound("Conversation");
  return c.body(null, 204);
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

  c.header("Cache-Control", "no-store");
  c.header("X-Accel-Buffering", "no");
  return streamSSE(c, async (stream) => {
    const ctrl = new AbortController();
    stream.onAbort(() => ctrl.abort());
    const emit = (e: AskEvent) => stream.writeSSE({ data: JSON.stringify(e) });
    const started = Date.now();
    try {
      const client = createAskClient(provider, testFetch(c.env));
      const result = await runAsk({ db, provider, client, user, input, emit, signal: ctrl.signal, timeZone: input.timeZone ?? deploymentTimeZone(c.env) });
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
