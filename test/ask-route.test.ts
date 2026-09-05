import { afterEach, describe, expect, it } from "vitest";
import type { AskEvent } from "@shared/schemas/ask";
import { api, createContact } from "./helpers";

type Chunk = Record<string, unknown>;

/** Serialise OpenAI streaming chunks as an SSE body. */
function sseBody(chunks: Chunk[]): string {
  return chunks.map((c) => `data: ${JSON.stringify({ id: "chatcmpl-test", object: "chat.completion.chunk", created: 1, model: "test-model", ...c })}\n\n`).join("") + "data: [DONE]\n\n";
}
const textTurn = (text: string): Chunk[] => [
  { choices: [{ index: 0, delta: { role: "assistant", content: text.slice(0, 3) }, finish_reason: null }] },
  { choices: [{ index: 0, delta: { content: text.slice(3) }, finish_reason: null }] },
  { choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
];
const toolTurn = (id: string, name: string, args: string): Chunk[] => [
  { choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: args.slice(0, 4) } }] }, finish_reason: null }] },
  { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: args.slice(4) } }] }, finish_reason: null }] },
  { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 20, completion_tokens: 8 } },
];
/** Text plus one or more tool calls in the same assistant message. */
const mixedTurn = (text: string, calls: { id: string; name: string; args: string }[]): Chunk[] => [
  { choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] },
  ...calls.map((c, index) => ({
    choices: [{ index: 0, delta: { tool_calls: [{ index, id: c.id, type: "function", function: { name: c.name, arguments: c.args } }] }, finish_reason: null }],
  })),
  { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 20, completion_tokens: 8 } },
];

type Seen = { url: string; headers: Headers; body: Record<string, unknown> };

/** Install a scripted upstream: each call answers with the next script entry. */
function installUpstream(script: ((seen: Seen, n: number) => Response | Chunk[])[]): Seen[] {
  const seen: Seen[] = [];
  (globalThis as { __askFakeUpstream?: typeof fetch }).__askFakeUpstream = async (input, init) => {
    const req = new Request(input, init);
    const s: Seen = { url: req.url, headers: req.headers, body: JSON.parse(await req.text()) };
    seen.push(s);
    const step = script[Math.min(seen.length - 1, script.length - 1)]!(s, seen.length);
    if (step instanceof Response) return step;
    return new Response(sseBody(step), { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  return seen;
}

async function ask(body: unknown, init?: RequestInit): Promise<{ status: number; type: string | null; events: AskEvent[]; raw: string }> {
  const res = await api("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...init });
  const raw = await res.text();
  const events = raw
    .split("\n\n")
    .filter((f) => f.startsWith("data:"))
    .map((f) => JSON.parse(f.slice(5).trim()) as AskEvent);
  return { status: res.status, type: res.headers.get("content-type"), events, raw };
}

describe("POST /api/ask", () => {
  afterEach(() => {
    delete (globalThis as { __askFakeUpstream?: unknown }).__askFakeUpstream;
  });

  it("exposes its configuration", async () => {
    const res = await api("/api/ask/config");
    expect(await res.json()).toEqual({ label: "test", model: "test-model" });
  });

  it("runs a tool call, feeds the result back, and streams the answer", async () => {
    const alice = await createContact({ firstName: "Alice", lastName: "Hartley" });
    const seen = installUpstream([
      () => toolTurn("call_1", "search_contacts", JSON.stringify({ q: "Alice" })),
      () => textTurn(`You last spoke to [@Alice Hartley](/contacts/${alice.id}) yesterday.`),
    ]);
    const r = await ask({ question: "When did I last speak to Alice?", messages: [{ role: "user", text: "hi" }, { role: "assistant", text: "hello" }] });
    expect(r.status).toBe(200);
    expect(r.type).toContain("text/event-stream");
    const types = r.events.map((e) => e.type);
    expect(types).toEqual(["tool_call", "tool_result", "text", "text", "done"]);
    expect(r.events[0]).toMatchObject({ type: "tool_call", id: "call_1", name: "search_contacts", label: "Searching contacts for “Alice”", input: { q: "Alice" } });
    expect(r.events[1]).toMatchObject({ type: "tool_result", id: "call_1", ok: true });
    expect(r.events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("")).toContain(alice.id);
    expect(r.events.at(-1)).toMatchObject({ type: "done", stop: "end_turn", iterations: 2, usage: { input: 30, output: 13 } });

    // Upstream request shape: system first, history, question; extra headers/body applied.
    expect(seen).toHaveLength(2);
    const first = seen[0]!;
    expect(first.url).toBe("https://ai.test/v1/chat/completions");
    expect(first.headers.get("x-test-header")).toBe("yes");
    // "none" means no provider key: the Authorization header is omitted so BYOK gateways use their stored key.
    expect(first.headers.get("authorization")).toBeNull();
    expect(first.body.model).toBe("test-model");
    expect(first.body.stream).toBe(true);
    expect(first.body.parallel_tool_calls).toBe(true);
    const msgs = first.body.messages as { role: string; content: unknown }[];
    expect(msgs[0]!.role).toBe("system");
    expect(String(msgs[0]!.content)).toMatch(/opsec▮/);
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect((first.body.tools as { function: { name: string } }[]).map((t) => t.function.name)).toContain("search_contacts");

    const second = seen[1]!.body.messages as { role: string; tool_call_id?: string; tool_calls?: unknown[]; content: unknown }[];
    const assistant = second.at(-2)!;
    expect(assistant.role).toBe("assistant");
    expect(assistant.tool_calls).toHaveLength(1);
    const toolMsg = second.at(-1)!;
    expect(toolMsg).toMatchObject({ role: "tool", tool_call_id: "call_1" });
    expect(String(toolMsg.content)).toContain(alice.id);
  });

  it("sends an attached image as an image_url part", async () => {
    const seen = installUpstream([() => textTurn("I can see a chat.")]);
    const r = await ask({ question: "What is this?", image: { mediaType: "image/png", data: "iVBORw0KGgo=" } });
    expect(r.events.at(-1)).toMatchObject({ type: "done", stop: "end_turn" });
    const last = (seen[0]!.body.messages as { content: unknown }[]).at(-1)!;
    expect(last.content).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
      { type: "text", text: "What is this?" },
    ]);
  });

  it("turns a final suggest_replies call into quick replies and ends the turn without another provider call", async () => {
    const seen = installUpstream([
      () => mixedTurn("Nobody called Sam Lee exists yet. Shall I create them?", [{ id: "call_s", name: "suggest_replies", args: JSON.stringify({ replies: ["Yes, create Sam Lee", " yes, create sam lee ", "", "No, I meant someone else", "Skip it", "One too many"] }) }]),
    ]);
    const r = await ask({ question: "Log lunch with Sam Lee" });
    expect(r.events.map((e) => e.type)).toEqual(["text", "suggestions", "done"]);
    expect(r.events[1]).toEqual({ type: "suggestions", replies: ["Yes, create Sam Lee", "No, I meant someone else", "Skip it", "One too many"] });
    expect(r.events.at(-1)).toMatchObject({ type: "done", stop: "end_turn", iterations: 1 });
    expect(seen).toHaveLength(1);
    expect((seen[0]!.body.tools as { function: { name: string } }[]).map((t) => t.function.name)).toContain("suggest_replies");
  });

  it("uses the question argument as the message text when the model wrote none", async () => {
    installUpstream([() => toolTurn("call_s", "suggest_replies", JSON.stringify({ question: "Which Alice did you mean?", replies: ["Alice Hartley", "Alice Wong"] }))]);
    const r = await ask({ question: "Call Alice" });
    expect(r.events).toEqual([
      { type: "text", delta: "Which Alice did you mean?" },
      { type: "suggestions", replies: ["Alice Hartley", "Alice Wong"] },
      expect.objectContaining({ type: "done", stop: "end_turn" }),
    ]);
  });

  it("rejects suggest_replies that is mixed with lookups or malformed, and lets the model carry on", async () => {
    const seen = installUpstream([
      () =>
        mixedTurn("Checking…", [
          { id: "call_a", name: "search_contacts", args: JSON.stringify({ q: "zzz-nobody" }) },
          { id: "call_b", name: "suggest_replies", args: JSON.stringify({ replies: ["Yes"] }) },
        ]),
      () => toolTurn("call_c", "suggest_replies", JSON.stringify({ replies: [] })),
      () => textTurn("No match. Shall I create them?"),
    ]);
    const r = await ask({ question: "Log lunch with zzz-nobody" });
    expect(r.events.filter((e) => e.type === "suggestions")).toHaveLength(0);
    const results = r.events.filter((e) => e.type === "tool_result") as { id: string; ok: boolean; summary: string }[];
    expect(results.find((e) => e.id === "call_a")?.ok).toBe(true);
    expect(results.find((e) => e.id === "call_b")).toMatchObject({ ok: false, summary: expect.stringMatching(/only tool call/) });
    expect(results.find((e) => e.id === "call_c")).toMatchObject({ ok: false, summary: expect.stringMatching(/Invalid arguments/) });
    expect(r.events.at(-1)).toMatchObject({ type: "done", stop: "end_turn", iterations: 3 });
    expect(seen).toHaveLength(3);
  });

  it("stops at the iteration cap when the model keeps calling tools", async () => {
    installUpstream([() => toolTurn("call_x", "search_contacts", JSON.stringify({ q: "loop" }))]);
    const r = await ask({ question: "loop" });
    expect(r.events.at(-1)).toMatchObject({ type: "done", stop: "max_iterations", iterations: 12 });
    expect(r.events.filter((e) => e.type === "tool_call")).toHaveLength(11);
  });

  it("reports upstream failures as an error event, and provider auth separately", async () => {
    installUpstream([() => new Response("boom", { status: 500 })]);
    const r = await ask({ question: "x" });
    expect(r.events.at(-1)).toMatchObject({ type: "error", code: "upstream" });
    installUpstream([() => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401, headers: { "content-type": "application/json" } })]);
    const r2 = await ask({ question: "x" });
    expect(r2.events.at(-1)).toMatchObject({ type: "error", code: "provider_auth" });
  });

  it("validates input and requires a session", async () => {
    expect((await ask({ question: "" })).status).toBe(400);
    expect((await ask({ question: "x", image: { mediaType: "image/bmp", data: "abc" } })).status).toBe(400);
    const anon = await api("/api/ask", { anonymous: true, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: "x" }) });
    expect(anon.status).toBe(401);
  });
});
