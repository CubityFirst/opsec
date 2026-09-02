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

/** Paths under /api that work without a session. */
function isPublic(path: string, env: Pick<AppVars, "ENVIRONMENT">): boolean {
  if (path === "/api/health") return true;
  if (path.startsWith("/api/auth/")) return true;
  // Local seeding runs from a script with no browser session.
  if (env.ENVIRONMENT === "development" && path.startsWith("/api/dev/")) return true;
  return false;
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!isPublic(new URL(c.req.url).pathname, c.env) && !c.get("user")) throw ApiError.unauthorized();
  await next();
};

/** Gate for admin-only routes. Decided by the `roles` claim, never by a hardcoded id or email. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user) throw ApiError.unauthorized();
  if (!isAdmin(user)) throw ApiError.forbidden();
  await next();
};
