import OpenAI from "openai";

/** Short, human-readable tail of an upstream error body (no headers or request data). */
function upstreamDetail(err: InstanceType<typeof OpenAI.APIError>): string {
  // Only a structured error message from the provider is passed on; raw bodies (HTML error
  // pages, whatever a mis-set base URL returns) are not echoed to the browser.
  const e = err.error as { message?: unknown; error?: { message?: unknown } } | undefined;
  const raw = e?.error?.message ?? e?.message;
  if (typeof raw !== "string" || !raw.trim()) return "no details";
  return raw.replace(/\s+/g, " ").slice(0, 300);
}

/** Map SDK/provider failures to a stable code and a message safe to show in the UI. */
export function classifyAskError(err: unknown): { code: string; message: string } {
  if (err instanceof OpenAI.AuthenticationError) return { code: "provider_auth", message: `The model provider rejected the credentials: ${upstreamDetail(err)}` };
  if (err instanceof OpenAI.RateLimitError) return { code: "rate_limited", message: "The model provider is rate limiting; try again shortly." };
  if (err instanceof OpenAI.APIConnectionError) return { code: "provider_unreachable", message: "Could not reach the model provider." };
  if (err instanceof OpenAI.APIError) return { code: "upstream", message: `The model provider returned ${err.status ?? "an error"}: ${upstreamDetail(err)}` };
  if (err instanceof Error && /not configured|must be a JSON object/.test(err.message)) return { code: "not_configured", message: err.message };
  return { code: "internal", message: "Something went wrong while answering." };
}
