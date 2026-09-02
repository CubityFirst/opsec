import { ApiError, parseError } from "./api";

/**
 * POST JSON and iterate the server-sent `data:` lines as parsed objects.
 * Non-2xx responses throw the same ApiError the JSON wrapper would.
 */
export async function* streamEvents<T>(path: string, body: unknown, signal?: AbortSignal): AsyncGenerator<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (signal?.aborted) return;
    throw new ApiError(0, "network_error", e instanceof Error ? e.message : "Network error");
  }
  if (!res.ok) throw await parseError(res);
  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let i: number;
      while ((i = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload) yield JSON.parse(payload) as T;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
