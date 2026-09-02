import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { AiSettingsOut, AiTestResult } from "@shared/schemas/ai-settings";
import { apiAs, json } from "./helpers";

type Seen = { url: string; headers: Headers; body: Record<string, unknown> };

function installUpstream(respond: (seen: Seen) => Response): Seen[] {
  const seen: Seen[] = [];
  (globalThis as { __askFakeUpstream?: typeof fetch }).__askFakeUpstream = async (input, init) => {
    const req = new Request(input, init);
    const s: Seen = { url: req.url, headers: req.headers, body: JSON.parse(await req.text()) };
    seen.push(s);
    return respond(s);
  };
  return seen;
}

const okCompletion = () =>
  new Response(
    JSON.stringify({
      id: "chatcmpl-1",
      object: "chat.completion",
      created: 1,
      model: "m-1",
      choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
    }),
    { headers: { "content-type": "application/json" } },
  );

const CUSTOM = { baseUrl: "https://custom.test/v1", model: "custom-model", label: "Custom" };

describe("AI provider settings", () => {
  afterEach(() => {
    delete (globalThis as { __askFakeUpstream?: unknown }).__askFakeUpstream;
  });

  it("is admin-only", async () => {
    const r = await apiAs({ sub: "plain-user", roles: ["user"], email: "allowed@example.com", emailVerified: true }, "/api/ai/settings");
    expect(r.status).toBe(403);
  });

  it("reports the deployment config until something is saved", async () => {
    const { status, body } = await json<AiSettingsOut>("/api/ai/settings");
    expect(status).toBe(200);
    expect(body.source).toBe("env");
    expect(body.updatedAt).toBeNull();
    expect(body.active).toEqual({
      baseUrl: "https://ai.test/v1",
      model: "test-model",
      label: "test",
      extraBody: '{"parallel_tool_calls":true}',
      apiKeySet: false,
      extraHeaderNames: ["x-test-header"],
    });
  });

  it("rejects bad input", async () => {
    expect((await json("/api/ai/settings", { method: "PUT", body: { ...CUSTOM, baseUrl: "nope" } })).status).toBe(400);
    expect((await json("/api/ai/settings", { method: "PUT", body: { ...CUSTOM, extraBody: "[1]" } })).status).toBe(400);
    expect((await json("/api/ai/settings", { method: "PUT", body: { ...CUSTOM, extraHeaders: "{oops" } })).status).toBe(400);
  });

  it("saves settings, keeps secrets write-only and encrypted, and Ask uses them", async () => {
    const saved = await json<AiSettingsOut>("/api/ai/settings", {
      method: "PUT",
      body: { ...CUSTOM, apiKey: "sk-secret-123", extraHeaders: '{"x-custom":"1"}' },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.source).toBe("db");
    expect(saved.body.updatedAt).toBeTruthy();
    expect(saved.body.active).toMatchObject({ ...CUSTOM, apiKeySet: true, extraHeaderNames: ["x-custom"] });
    expect(saved.body.env.model).toBe("test-model");
    expect(JSON.stringify(saved.body)).not.toContain("sk-secret-123");

    const row = await env.DB.prepare("select value from app_settings where key = 'ai_provider'").first<{ value: string }>();
    expect(row?.value).not.toContain("sk-secret-123");
    expect(row?.value).not.toContain("x-custom");
    expect(JSON.parse(row!.value).apiKeyEnc).toMatch(/^v1\./);

    const cfg = await json("/api/ask/config");
    expect(cfg.body).toEqual({ label: "Custom", model: "custom-model" });

    // Test with omitted secrets: the stored key and headers are used, the env ones are not.
    const seen = installUpstream(okCompletion);
    const t = await json<AiTestResult>("/api/ai/settings/test", { method: "POST", body: { baseUrl: CUSTOM.baseUrl, model: CUSTOM.model } });
    expect(t.body).toMatchObject({ ok: true, model: "m-1", reply: "OK" });
    expect(seen[0]!.url).toBe("https://custom.test/v1/chat/completions");
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer sk-secret-123");
    expect(seen[0]!.headers.get("x-custom")).toBe("1");
    expect(seen[0]!.headers.get("x-test-header")).toBeNull();
    expect(seen[0]!.body.model).toBe("custom-model");
    expect(seen[0]!.body.parallel_tool_calls).toBeUndefined();
    expect(seen[0]!.body.stream).toBeUndefined();

    // Updating without secrets keeps them; sending "" clears.
    const kept = await json<AiSettingsOut>("/api/ai/settings", { method: "PUT", body: { ...CUSTOM, model: "custom-2" } });
    expect(kept.body.active).toMatchObject({ model: "custom-2", apiKeySet: true, extraHeaderNames: ["x-custom"] });
    const cleared = await json<AiSettingsOut>("/api/ai/settings", { method: "PUT", body: { ...CUSTOM, model: "custom-2", extraHeaders: "" } });
    expect(cleared.body.active.extraHeaderNames).toEqual([]);
    expect(cleared.body.active.apiKeySet).toBe(true);
  });

  it("reports provider failures from the test endpoint without throwing", async () => {
    installUpstream(() => new Response(JSON.stringify({ error: { message: "Incorrect API key provided" } }), { status: 401, headers: { "content-type": "application/json" } }));
    const t = await json<AiTestResult>("/api/ai/settings/test", { method: "POST", body: CUSTOM });
    expect(t.status).toBe(200);
    expect(t.body).toMatchObject({ ok: false, code: "provider_auth" });
    expect((t.body as { message: string }).message).toContain("Incorrect API key");
  });

  it("reverts to the deployment config", async () => {
    const r = await json<AiSettingsOut>("/api/ai/settings", { method: "DELETE" });
    expect(r.body.source).toBe("env");
    expect(r.body.active.model).toBe("test-model");
    const cfg = await json("/api/ask/config");
    expect(cfg.body).toEqual({ label: "test", model: "test-model" });
  });
});
