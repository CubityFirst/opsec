import type { AppVars } from "../../env";

/** Resolved provider configuration used by the Ask client, whatever its source. */
export interface AiProvider {
  baseUrl: string;
  model: string;
  label: string;
  /** JSON object text merged into every request, or "". */
  extraBody: string;
  apiKey: string;
  /** JSON object text of extra request headers, or "". */
  extraHeaders: string;
}

export type AiEnv = Pick<AppVars, "AI_BASE_URL" | "AI_MODEL" | "AI_LABEL" | "AI_EXTRA_BODY" | "AI_API_KEY" | "AI_EXTRA_HEADERS">;

/** The deployment's vars/secrets as a provider config (the fallback when nothing is saved in the app). */
export function envProvider(env: AiEnv): AiProvider {
  return {
    baseUrl: env.AI_BASE_URL ?? "",
    model: env.AI_MODEL ?? "",
    label: env.AI_LABEL ?? "",
    extraBody: env.AI_EXTRA_BODY ?? "",
    apiKey: env.AI_API_KEY ?? "",
    extraHeaders: env.AI_EXTRA_HEADERS ?? "",
  };
}

/** Test hook: when ASK_FAKE_UPSTREAM=1, provider calls go to a fetch installed by tests on globalThis. */
export function testFetch(env: unknown): typeof fetch | undefined {
  if ((env as { ASK_FAKE_UPSTREAM?: string }).ASK_FAKE_UPSTREAM !== "1") return undefined;
  return (input, init) => {
    const handler = (globalThis as { __askFakeUpstream?: typeof fetch }).__askFakeUpstream;
    if (!handler) return Promise.resolve(new Response("no fake upstream installed", { status: 500 }));
    return handler(input, init);
  };
}
