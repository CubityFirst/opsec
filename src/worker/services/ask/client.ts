import OpenAI from "openai";
import type { AskConfig } from "@shared/schemas/ask";
import { PROVIDER_TIMEOUT_MS } from "./limits";
import type { AiProvider } from "./provider";

function parseJsonObject(raw: string | undefined, what: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new Error(`${what} must be a JSON object`);
}

/** Headers merged into every provider request (e.g. cf-aig-authorization for an authenticated AI Gateway). */
export function extraHeaders(p: Pick<AiProvider, "extraHeaders">): Record<string, string> {
  const o = parseJsonObject(p.extraHeaders, "Extra headers");
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]));
}

/** Provider-specific request fields merged into every completion call (e.g. `reasoning_effort`, `thinking`, `parallel_tool_calls`). */
export function extraBody(p: Pick<AiProvider, "extraBody">): Record<string, unknown> {
  return parseJsonObject(p.extraBody, "Extra body");
}

/** "none" or blank means: send no Authorization header at all (BYOK gateways substitute their stored key only when it is absent; local servers ignore it). */
export function hasProviderKey(p: Pick<AiProvider, "apiKey">): boolean {
  return !!p.apiKey && p.apiKey.trim().toLowerCase() !== "none";
}

/**
 * Any OpenAI-compatible chat-completions server: Cloudflare AI Gateway,
 * Anthropic's compatibility layer, llama.cpp, OpenRouter… Selected purely by
 * configuration (README → Ask): the app's saved settings, else the deployment vars.
 */
export function createAskClient(p: AiProvider, fetchImpl?: typeof fetch): OpenAI {
  if (!p.baseUrl) throw new Error("Ask is not configured: no base URL");
  const keyed = hasProviderKey(p);
  return new OpenAI({
    baseURL: p.baseUrl,
    apiKey: keyed ? p.apiKey : "none",
    defaultHeaders: keyed ? extraHeaders(p) : { ...extraHeaders(p), Authorization: null },
    maxRetries: 1,
    timeout: PROVIDER_TIMEOUT_MS,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

export function askConfig(p: AiProvider): AskConfig {
  return { label: p.label || p.model || "not configured", model: p.model };
}
