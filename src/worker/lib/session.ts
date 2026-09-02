import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import { withPreferenceDefaults } from "@shared/schemas/preferences";
import type { AuthUser } from "@shared/types";
import type { AppVars } from "../env";
import { ApiError } from "./errors";

export const SESSION_COOKIE = "opsec_session";
/** Short-lived cookie holding the PKCE verifier, state and nonce between /login and /callback. */
export const TX_COOKIE = "opsec_oidc_tx";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const TX_TTL_SECONDS = 10 * 60;

/** What the session cookie carries. Derived only from a verified id_token; keyed on `sub`. */
export interface SessionUser {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  roles: string[];
}

export type AuthMode = "open" | "oidc";

/**
 * Unset or "open" is open access (see wrangler.jsonc); "oidc" enables sign-in. Any
 * other value is a misconfiguration and fails closed with a 500 rather than
 * silently opening the instance.
 */
export function authMode(env: Pick<AppVars, "AUTH_MODE">): AuthMode {
  const v = (env.AUTH_MODE ?? "").trim().toLowerCase();
  if (v === "" || v === "open") return "open";
  if (v === "oidc") return "oidc";
  throw new ApiError(500, "internal", `Unrecognised AUTH_MODE "${env.AUTH_MODE}": use "open" or "oidc".`);
}

/** The single implicit user of an open-access instance. Everything is attributed to it. */
export const OPEN_USER: SessionUser = { sub: "local", email: null, emailVerified: false, name: "Owner", picture: null, roles: ["admin"] };

export function authInfo(env: Pick<AppVars, "AUTH_MODE" | "AUTH_PROVIDER_LABEL">): { authMode: AuthMode; providerLabel: string } {
  return { authMode: authMode(env), providerLabel: env.AUTH_PROVIDER_LABEL || "SSO" };
}

export function isAdmin(user: SessionUser | null | undefined): boolean {
  return !!user && user.roles.includes("admin");
}

/**
 * Access policy: admins always; otherwise only verified emails on the
 * ACCESS_ALLOWED_EMAILS allowlist (comma-separated, case-insensitive).
 */
export function isAllowed(user: SessionUser | null | undefined, env: Pick<AppVars, "ACCESS_ALLOWED_EMAILS">): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (!user.email || !user.emailVerified) return false;
  const allowed = (env.ACCESS_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(user.email.toLowerCase());
}

export const NOT_ALLOWED_MESSAGE = "This account is not allowed to use opsec▮.";

/** The cookie-signing secret; oidc mode cannot run without it. */
export function sessionSecret(env: Pick<AppVars, "SESSION_SECRET">): string {
  if (!env.SESSION_SECRET) {
    throw new ApiError(500, "internal", "Sign-in is not configured: SESSION_SECRET is missing. Set it with `npx wrangler secret put SESSION_SECRET` (any long random string).");
  }
  if (env.SESSION_SECRET.length < 32) {
    throw new ApiError(500, "internal", "SESSION_SECRET is too short: use at least 32 characters (e.g. `openssl rand -base64 48`).");
  }
  return env.SESSION_SECRET;
}

export function toAuthUser(user: SessionUser, preferences: unknown, env: Pick<AppVars, "AUTH_MODE" | "AUTH_PROVIDER_LABEL">): AuthUser {
  return { ...user, isAdmin: isAdmin(user), preferences: withPreferenceDefaults(preferences), ...authInfo(env) };
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function signSession(user: SessionUser, secret: string, ttl = SESSION_TTL_SECONDS): Promise<string> {
  const iat = nowSeconds();
  return sign({ ...user, iat, exp: iat + ttl }, secret, "HS256");
}

export async function verifySession(token: string, secret: string): Promise<SessionUser | null> {
  try {
    const p = (await verify(token, secret, "HS256")) as Record<string, unknown>;
    if (typeof p.sub !== "string" || !p.sub) return null;
    return {
      sub: p.sub,
      email: typeof p.email === "string" ? p.email : null,
      emailVerified: p.emailVerified === true,
      name: typeof p.name === "string" ? p.name : null,
      picture: typeof p.picture === "string" ? p.picture : null,
      roles: Array.isArray(p.roles) ? p.roles.filter((r): r is string => typeof r === "string") : [],
    };
  } catch {
    return null;
  }
}

export interface LoginTx {
  verifier: string;
  state: string;
  nonce: string;
  next: string;
}

export async function signTx(tx: LoginTx, secret: string): Promise<string> {
  const iat = nowSeconds();
  return sign({ ...tx, iat, exp: iat + TX_TTL_SECONDS }, secret, "HS256");
}

export async function verifyTx(token: string, secret: string): Promise<LoginTx | null> {
  try {
    const p = (await verify(token, secret, "HS256")) as Record<string, unknown>;
    if ([p.verifier, p.state, p.nonce, p.next].some((v) => typeof v !== "string")) return null;
    return { verifier: p.verifier as string, state: p.state as string, nonce: p.nonce as string, next: p.next as string };
  } catch {
    return null;
  }
}

function secure(c: Context): boolean {
  return new URL(c.req.url).protocol === "https:";
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: secure(c), sameSite: "Lax", path: "/", maxAge: SESSION_TTL_SECONDS });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export function setTxCookie(c: Context, token: string) {
  setCookie(c, TX_COOKIE, token, { httpOnly: true, secure: secure(c), sameSite: "Lax", path: "/api/auth", maxAge: TX_TTL_SECONDS });
}

export function readTxCookie(c: Context): string | undefined {
  return getCookie(c, TX_COOKIE);
}

export function clearTxCookie(c: Context) {
  deleteCookie(c, TX_COOKIE, { path: "/api/auth" });
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

/** Only allow same-origin relative paths as post-login destinations. */
export function safeNext(raw: string | undefined | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw.startsWith("/api/")) return "/";
  return raw;
}
