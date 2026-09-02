import { eq } from "drizzle-orm";
import type { AiProviderView, AiSettingsOut, AiSettingsUpdate, AiTestResult } from "@shared/schemas/ai-settings";
import { schema, type Db } from "../db";
import type { AppVars } from "../env";
import { decryptString, encryptString } from "../lib/crypto";
import { ApiError } from "../lib/errors";
import { nowIso } from "../lib/time";
import { createAskClient, extraBody, extraHeaders, hasProviderKey } from "./ask/client";
import { classifyAskError } from "./ask/errors";
import { envProvider, type AiEnv, type AiProvider } from "./ask/provider";

const KEY = "ai_provider";
type SecretEnv = Pick<AppVars, "SESSION_SECRET">;

/** Row shape under app_settings.value; secrets are AES-GCM ciphertext (see lib/crypto.ts). */
interface StoredAi {
  baseUrl: string;
  model: string;
  label: string;
  extraBody: string;
  apiKeyEnc: string;
  extraHeadersEnc: string;
}

function secretKey(env: SecretEnv): string {
  if (!env.SESSION_SECRET) throw new ApiError(400, "bad_request", "SESSION_SECRET is not set, so provider keys cannot be stored. Run `npx wrangler secret put SESSION_SECRET` (any long random string), or use a key-less provider (BYOK gateway / local server).");
  return env.SESSION_SECRET;
}

export async function loadStoredProvider(db: Db, env: SecretEnv): Promise<{ provider: AiProvider; updatedAt: string; secretsUnreadable: boolean } | null> {
  const row = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, KEY)).get();
  if (!row) return null;
  const v = row.value as unknown as StoredAi;
  // A rotated or missing SESSION_SECRET must not take Ask or the settings page down: the
  // secrets simply read as unset and the UI asks for them again.
  let secretsUnreadable = false;
  const open = async (enc: string): Promise<string> => {
    if (!enc) return "";
    try {
      return await decryptString(secretKey(env), enc);
    } catch {
      secretsUnreadable = true;
      return "";
    }
  };
  const apiKey = await open(v.apiKeyEnc);
  const extraHeaders = await open(v.extraHeadersEnc);
  return {
    provider: { baseUrl: v.baseUrl, model: v.model, label: v.label, extraBody: v.extraBody, apiKey, extraHeaders },
    updatedAt: row.updatedAt,
    secretsUnreadable,
  };
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The provider Ask should use right now: saved settings win, else the deployment's vars/secrets. */
export async function resolveProvider(
  db: Db,
  env: AiEnv & SecretEnv,
): Promise<{ provider: AiProvider; source: "db" | "env"; updatedAt: string | null; secretsUnreadable: boolean }> {
  const stored = await loadStoredProvider(db, env);
  if (stored) return { ...stored, source: "db" };
  return { provider: envProvider(env), source: "env", updatedAt: null, secretsUnreadable: false };
}

/** Apply a settings update on top of the active config ("omit to keep" for secrets) without storing it. */
export async function mergeProvider(db: Db, env: AiEnv & SecretEnv, input: AiSettingsUpdate): Promise<AiProvider> {
  const { provider: active } = await resolveProvider(db, env);
  // Secrets are bound to the origin they were entered for: pointing the base URL at a
  // different host must not carry the stored key or headers along (that would let the
  // Worker be used to read them back), so they have to be supplied again.
  const sameOrigin = originOf(input.baseUrl) !== null && originOf(input.baseUrl) === originOf(active.baseUrl);
  return {
    baseUrl: input.baseUrl,
    model: input.model,
    label: input.label,
    extraBody: input.extraBody,
    apiKey: input.apiKey ?? (sameOrigin ? active.apiKey : ""),
    extraHeaders: input.extraHeaders ?? (sameOrigin ? active.extraHeaders : ""),
  };
}

export async function saveProvider(db: Db, env: AiEnv & SecretEnv, input: AiSettingsUpdate): Promise<void> {
  const p = await mergeProvider(db, env, input);
  const value: StoredAi = {
    baseUrl: p.baseUrl,
    model: p.model,
    label: p.label,
    extraBody: p.extraBody,
    apiKeyEnc: p.apiKey ? await encryptString(secretKey(env), p.apiKey) : "",
    extraHeadersEnc: p.extraHeaders ? await encryptString(secretKey(env), p.extraHeaders) : "",
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
  return {
    source: r.source,
    active: providerView(r.provider),
    env: providerView(envProvider(env)),
    updatedAt: r.updatedAt,
    ...(r.secretsUnreadable ? { secretsUnreadable: true } : {}),
  };
}

/** One tiny non-streaming completion to prove the base URL, credentials and model name work together. */
export async function testProvider(p: AiProvider, fetchImpl?: typeof fetch): Promise<AiTestResult> {
  const started = Date.now();
  try {
    const client = createAskClient(p, fetchImpl);
    const res = await client.chat.completions.create(
      { max_completion_tokens: 16, ...extraBody(p), model: p.model, messages: [{ role: "user", content: "Reply with the single word OK." }], stream: false },
      { signal: AbortSignal.timeout(30_000) },
    );
    const reply = res.choices[0]?.message?.content?.trim() ?? "";
    return { ok: true, ms: Date.now() - started, model: res.model || p.model, reply: reply.slice(0, 200) };
  } catch (err) {
    const { code, message } = classifyAskError(err);
    return { ok: false, ms: Date.now() - started, code, message };
  }
}
