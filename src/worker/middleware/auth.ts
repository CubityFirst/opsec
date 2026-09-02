import type { MiddlewareHandler } from "hono";
import type { AppEnv, AppVars } from "../env";
import { ApiError } from "../lib/errors";
import { OPEN_USER, authMode, isAdmin, isAllowed, readSessionCookie, verifySession } from "../lib/session";

/**
 * Reads and verifies the session cookie; never rejects on its own. A valid
 * session for an account outside the access policy is treated as no session,
 * so a later policy change locks existing cookies out immediately.
 */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (authMode(c.env) === "open") {
    c.set("user", OPEN_USER);
    c.set("actor", OPEN_USER.sub);
    await next();
    return;
  }
  const token = readSessionCookie(c);
  const verified = token && c.env.SESSION_SECRET ? await verifySession(token, c.env.SESSION_SECRET) : null;
  const user = isAllowed(verified, c.env) ? verified : null;
  c.set("user", user);
  c.set("actor", user?.sub ?? "anonymous");
  await next();
};

/** True only for a local dev server: the dev routes are never public on a real hostname. */
export function isLocalDev(url: URL, env: Pick<AppVars, "ENVIRONMENT">): boolean {
  return env.ENVIRONMENT === "development" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
}

/** Paths under /api that work without a session. */
function isPublic(url: URL, env: Pick<AppVars, "ENVIRONMENT">): boolean {
  const path = url.pathname;
  if (path === "/api/health") return true;
  if (path.startsWith("/api/auth/")) return true;
  // Local seeding runs from a script with no browser session.
  if (path.startsWith("/api/dev/") && isLocalDev(url, env)) return true;
  return false;
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!isPublic(new URL(c.req.url), c.env) && !c.get("user")) throw ApiError.unauthorized();
  await next();
};

/**
 * CSRF guard for state-changing API calls. Browsers send Sec-Fetch-Site (and
 * Origin) on cross-origin requests; anything not same-origin is refused. Requests
 * without either header (curl, tests, server-to-server) are unaffected, and the
 * session cookie is SameSite=Lax on top.
 */
export const rejectCrossSite: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const site = c.req.header("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") throw ApiError.forbidden("Cross-site request blocked");
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin) throw ApiError.forbidden("Cross-origin request blocked");
  }
  await next();
};

/** Gate for admin-only routes. Decided by the `roles` claim, never by a hardcoded id or email. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user) throw ApiError.unauthorized();
  if (!isAdmin(user)) throw ApiError.forbidden();
  await next();
};
