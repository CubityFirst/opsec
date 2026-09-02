import { eq } from "drizzle-orm";
import type { AiProviderView, AiSettingsOut, AiSettingsUpdate, AiTestResult } from "@shared/schemas/ai-settings";
import { schema, type Db } from "../db";
import { decryptString, encryptString } from "../lib/crypto";
import { nowIso } from "../lib/time";
import { createAskClient, extraBody, extraHeaders, hasProviderKey } from "./ask/client";
import { classifyAskError } from "./ask/errors";
import { envProvider, type AiEnv, type AiProvider } from "./ask/provider";

const KEY = "ai_provider";
type SecretEnv = Pick<Env, "SESSION_SECRET">;

/** Row shape under app_settings.value; secrets are AES-GCM ciphertext (see lib/crypto.ts). */
interface StoredAi {
  baseUrl: string;
  model: string;
  label: string;
  extraBody: string;
  apiKeyEnc: string;
  extraHeadersEnc: string;
}

export async function loadStoredProvider(db: Db, env: SecretEnv): Promise<{ provider: AiProvider; updatedAt: string } | null> {
  const row = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, KEY)).get();
  if (!row) return null;
  const v = row.value as unknown as StoredAi;
  return {
    provider: {
      baseUrl: v.baseUrl,
      model: v.model,
      label: v.label,
      extraBody: v.extraBody,
      apiKey: v.apiKeyEnc ? await decryptString(env.SESSION_SECRET, v.apiKeyEnc) : "",
      extraHeaders: v.extraHeadersEnc ? await decryptString(env.SESSION_SECRET, v.extraHeadersEnc) : "",
    },
    updatedAt: row.updatedAt,
  };
}

/** The provider Ask should use right now: saved settings win, else the deployment's vars/secrets. */
export async function resolveProvider(db: Db, env: AiEnv & SecretEnv): Promise<{ provider: AiProvider; source: "db" | "env"; updatedAt: string | null }> {
  const stored = await loadStoredProvider(db, env);
  if (stored) return { ...stored, source: "db" };
  return { provider: envProvider(env), source: "env", updatedAt: null };
}

/** Apply a settings update on top of the active config ("omit to keep" for secrets) without storing it. */
export async function mergeProvider(db: Db, env: AiEnv & SecretEnv, input: AiSettingsUpdate): Promise<AiProvider> {
  const { provider: active } = await resolveProvider(db, env);
  return {
    baseUrl: input.baseUrl,
    model: input.model,
    label: input.label,
    extraBody: input.extraBody,
    apiKey: input.apiKey ?? active.apiKey,
    extraHeaders: input.extraHeaders ?? active.extraHeaders,
  };
}

export async function saveProvider(db: Db, env: AiEnv & SecretEnv, input: AiSettingsUpdate): Promise<void> {
  const p = await mergeProvider(db, env, input);
  const value: StoredAi = {
    baseUrl: p.baseUrl,
    model: p.model,
    label: p.label,
    extraBody: p.extraBody,
    apiKeyEnc: p.apiKey ? await encryptString(env.SESSION_SECRET, p.apiKey) : "",
    extraHeadersEnc: p.extraHeaders ? await encryptString(env.SESSION_SECRET, p.extraHeaders) : "",
  };
  const json = value as unknown as Record<string, unknown>;
  const now = nowIso();
  await db
    .insert(schema.appSettings)
    .values({ key: KEY, value: json, updatedAt: now })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: json, updatedAt: now } });
}

export async function clearProvider(db: Db): Promise<void> {
  await db.delete(schema.appSettings).where(eq(schema.appSettings.key, KEY));
}

export function providerView(p: AiProvider): AiProviderView {
  let names: string[];
  try {
    names = Object.keys(extraHeaders(p));
  } catch {
    names = ["(invalid JSON)"];
  }
  return { baseUrl: p.baseUrl, model: p.model, label: p.label, extraBody: p.extraBody, apiKeySet: hasProviderKey(p), extraHeaderNames: names };
}

export async function settingsOut(db: Db, env: AiEnv & SecretEnv): Promise<AiSettingsOut> {
  const r = await resolveProvider(db, env);
  return { source: r.source, active: providerView(r.provider), env: providerView(envProvider(env)), updatedAt: r.updatedAt };
}

/** One tiny non-streaming completion to prove the base URL, credentials and model name work together. */
export async function testProvider(p: AiProvider, fetchImpl?: typeof fetch): Promise<AiTestResult> {
  const started = Date.now();
  try {
    const client = createAskClient(p, fetchImpl);
    const res = await client.chat.completions.create(
      { model: p.model, messages: [{ role: "user", content: "Reply with the single word OK." }], max_completion_tokens: 16, ...extraBody(p) },
      { signal: AbortSignal.timeout(30_000) },
    );
    const reply = res.choices[0]?.message?.content?.trim() ?? "";
    return { ok: true, ms: Date.now() - started, model: res.model || p.model, reply: reply.slice(0, 200) };
  } catch (err) {
    const { code, message } = classifyAskError(err);
    return { ok: false, ms: Date.now() - started, code, message };
  }
}
