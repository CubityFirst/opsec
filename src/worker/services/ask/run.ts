import type OpenAI from "openai";
import type { AskEvent, AskRequest, AskStop } from "@shared/schemas/ask";
import type { Db } from "../../db";
import type { SessionUser } from "../../lib/session";
import { extraBody } from "./client";
import type { AiProvider } from "./provider";
import { ByteBudget, MAX_HISTORY_CHARS_PER_TURN, MAX_HISTORY_TURNS_SENT, MAX_ITERATIONS, MAX_OUTPUT_TOKENS, MAX_TOOL_CALLS_PER_ITERATION } from "./limits";
import { systemMessage } from "./prompt";
import type { ToolCtx } from "./tool-def";
import { executeTool, toolDefinitions, type ToolCall } from "./tools";

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface RunAskArgs {
  db: Db;
  provider: Pick<AiProvider, "model" | "extraBody">;
  client: OpenAI;
  user: SessionUser;
  input: AskRequest;
  emit: (e: AskEvent) => void | Promise<void>;
  signal: AbortSignal;
  now?: Date;
}

export interface RunAskResult {
  stop: AskStop;
  iterations: number;
  usage: { input: number; output: number };
  toolsUsed: string[];
}

function buildMessages(user: SessionUser, input: AskRequest, now: Date): Msg[] {
  const history: Msg[] = input.messages.slice(-MAX_HISTORY_TURNS_SENT).map((t) => ({
    role: t.role,
    content: t.text.length > MAX_HISTORY_CHARS_PER_TURN ? `${t.text.slice(0, MAX_HISTORY_CHARS_PER_TURN)}\n…[earlier turn trimmed]` : t.text,
  }));
  const question: Msg = input.image
    ? {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${input.image.mediaType};base64,${input.image.data}` } },
          { type: "text", text: input.question },
        ],
      }
    : { role: "user", content: input.question };
  return [{ role: "system", content: systemMessage(user, now) }, ...history, question];
}

/**
 * The investigation loop: stream a completion, run any tool calls it makes,
 * feed the results back, repeat until the model answers or a cap is hit.
 * Emits UI events as it goes and returns a summary for logging.
 */
export async function runAsk(args: RunAskArgs): Promise<RunAskResult> {
  const { db, provider, client, user, input, emit, signal } = args;
  const messages = buildMessages(user, input, args.now ?? new Date());
  const tools = toolDefinitions();
  const budget = new ByteBudget();
  const pending: ToolCtx["pending"] = new Map();
  const usage = { input: 0, output: 0 };
  const toolsUsed: string[] = [];
  let iterations = 0;

  const finish = async (stop: AskStop): Promise<RunAskResult> => {
    await emit({ type: "done", stop, iterations, usage });
    return { stop, iterations, usage, toolsUsed };
  };

  while (true) {
    if (signal.aborted) return { stop: "aborted", iterations, usage, toolsUsed };
    const stream = await client.chat.completions.create(
      {
        model: provider.model,
        messages,
        tools,
        tool_choice: "auto",
        stream: true,
        stream_options: { include_usage: true },
        // OpenAI's current models reject `max_tokens`; every other compatible server accepts `max_completion_tokens` too (override via extra body if not).
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        ...extraBody(provider),
      },
      { signal },
    );

    let text = "";
    let finishReason: string | null = null;
    const calls = new Map<number, ToolCall>();
    for await (const chunk of stream) {
      if (chunk.usage) {
        usage.input += chunk.usage.prompt_tokens ?? 0;
        usage.output += chunk.usage.completion_tokens ?? 0;
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;
      if (delta?.content) {
        text += delta.content;
        await emit({ type: "text", delta: delta.content });
      }
      for (const tc of delta?.tool_calls ?? []) {
        const idx = tc.index ?? 0;
        const cur = calls.get(idx) ?? { id: "", name: "", argsJson: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.argsJson += tc.function.arguments;
        calls.set(idx, cur);
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
    iterations++;

    if (calls.size === 0) {
      return finish(finishReason === "length" ? "max_tokens" : "end_turn");
    }
    if (iterations >= MAX_ITERATIONS) return finish("max_iterations");

    const ordered = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c], i) => ({ ...c, id: c.id || `call_${iterations}_${i}` }));
    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: ordered.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.argsJson || "{}" } })),
    });

    const results = await Promise.all(
      ordered.map(async (c, i) => {
        if (i >= MAX_TOOL_CALLS_PER_ITERATION) {
          return { id: c.id, ok: false, content: JSON.stringify({ error: "Too many tool calls in one turn; retry this one next turn" }), summary: "skipped", bytes: 0 };
        }
        toolsUsed.push(c.name);
        const outcome = await executeTool(c, { db, emit: (e) => void emit(e), budget, pending });
        await emit({ type: "tool_result", id: c.id, ok: outcome.ok, summary: outcome.summary, bytes: outcome.bytes });
        return outcome;
      }),
    );
    for (const r of results) messages.push({ role: "tool", tool_call_id: r.id, content: r.content });

    if (budget.exhausted) {
      // One more turn is allowed so the model can answer from what it has; tools now refuse.
    }
  }
}
