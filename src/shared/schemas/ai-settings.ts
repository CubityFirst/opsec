import { z } from "zod";
import { nonBlank } from "./common";

/** Empty, or a JSON object literal. */
const jsonObjectText = z
  .string()
  .trim()
  .max(10_000)
  .refine((s) => {
    if (!s) return true;
    try {
      const v = JSON.parse(s);
      return !!v && typeof v === "object" && !Array.isArray(v);
    } catch {
      return false;
    }
  }, "Must be a JSON object");

/**
 * Provider settings edited in the UI. Secrets follow "omit to keep" semantics:
 * leave `apiKey` / `extraHeaders` out to keep what is active, send "" to clear.
 */
export const aiSettingsUpdateSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .url("Must be a URL")
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), "Must start with http:// or https://"),
  model: nonBlank(200),
  label: z.string().trim().max(100).default(""),
  extraBody: jsonObjectText.default(""),
  apiKey: z.string().max(4000).optional(),
  extraHeaders: jsonObjectText.optional(),
});
export type AiSettingsUpdate = z.infer<typeof aiSettingsUpdateSchema>;
export type AiSettingsInput = z.input<typeof aiSettingsUpdateSchema>;

/** Provider config as shown to admins: secrets are reported as present/absent only. */
export interface AiProviderView {
  baseUrl: string;
  model: string;
  label: string;
  extraBody: string;
  apiKeySet: boolean;
  extraHeaderNames: string[];
}

export interface AiSettingsOut {
  /** Where the active config comes from: saved in the app, or the deployment's vars/secrets. */
  source: "db" | "env";
  active: AiProviderView;
  env: AiProviderView;
  updatedAt: string | null;
  /** Stored secrets could not be decrypted (SESSION_SECRET changed or missing); they must be entered again. */
  secretsUnreadable?: boolean;
}

export type AiTestResult =
  | { ok: true; ms: number; model: string; reply: string }
  | { ok: false; ms: number; code: string; message: string };

export interface AiPreset {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  label: string;
  extraBody: string;
  extraHeaders: string;
  apiKeyHint: string;
  notes: string;
}

export const AI_PRESETS: AiPreset[] = [
  {
    id: "cloudflare-gateway",
    name: "Cloudflare AI Gateway (BYOK)",
    baseUrl: "https://gateway.ai.cloudflare.com/v1/<account-id>/<gateway>/compat",
    model: "openai/gpt-5.6-luna",
    label: "gpt-5.6-luna via AI Gateway",
    extraBody: '{"reasoning_effort":"none"}',
    extraHeaders: '{"cf-aig-authorization":"Bearer <AI Gateway Run token>"}',
    apiKeyHint: "none — provider keys live in the gateway; no Authorization header is sent",
    notes:
      "Model is {provider}/{model}. Add the provider's key under the gateway's Provider Keys and turn on Authenticated Gateway; the header carries the gateway's own token.",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.6-luna",
    label: "gpt-5.6-luna",
    extraBody: '{"reasoning_effort":"none"}',
    extraHeaders: "",
    apiKeyHint: "OpenAI API key",
    notes: "gpt-5.6 models only allow function tools on chat completions with reasoning_effort none.",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-5",
    label: "claude-sonnet-5",
    extraBody: "",
    extraHeaders: "",
    apiKeyHint: "Anthropic API key",
    notes: "Anthropic's OpenAI-compatible layer. Prompt caching is not available through it.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-5",
    label: "",
    extraBody: "",
    extraHeaders: "",
    apiKeyHint: "OpenRouter API key",
    notes: "Use OpenRouter's model naming.",
  },
  {
    id: "llama-cpp",
    name: "llama.cpp / local server",
    baseUrl: "http://localhost:8080/v1",
    model: "default",
    label: "local llama.cpp",
    extraBody: '{"parallel_tool_calls":true}',
    extraHeaders: "",
    apiKeyHint: "none",
    notes:
      "Run llama-server --jinja with a tool-capable chat template (--mmproj for images). The deployed Worker cannot reach a LAN host without a tunnel.",
  },
  {
    id: "custom",
    name: "Custom OpenAI-compatible",
    baseUrl: "",
    model: "",
    label: "",
    extraBody: "",
    extraHeaders: "",
    apiKeyHint: "Provider API key, or none",
    notes: "Any server that implements POST {base}/chat/completions with streaming and tools.",
  },
];
