import type { Hono } from "hono";
import type { AppEnv } from "./env";

let ref: Hono<AppEnv> | null = null;

/** Called once by index.ts after the app is assembled. */
export function registerApp(app: Hono<AppEnv>) {
  ref = app;
}

/**
 * Call our own API in-process, with no network hop, so that MCP write tools
 * go through exactly the same validation, authorisation and activity logging
 * as the UI. Requests should carry the caller's Authorization header.
 */
export function internalFetch(req: Request, env: unknown): Promise<Response> {
  if (!ref) throw new Error("App not registered");
  return Promise.resolve(ref.fetch(req, env as never));
}
