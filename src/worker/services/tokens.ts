import { and, desc, eq, isNull } from "drizzle-orm";
import { API_TOKEN_PREFIX, type ApiTokenCreateInput, type ApiTokenCreated, type ApiTokenOut, type ApiTokenScope } from "@shared/schemas/token";
import { schema, type Db } from "../db";
import type { AppVars } from "../env";
import { newId } from "../lib/ids";
import { OPEN_USER, authMode, isAllowed, type SessionUser } from "../lib/session";
import { nowIso } from "../lib/time";

const { apiTokens, users } = schema;
type TokenRow = typeof apiTokens.$inferSelect;

const LAST_USED_GRANULARITY_MS = 5 * 60 * 1000;

export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return API_TOKEN_PREFIX + btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function toTokenOut(r: TokenRow): ApiTokenOut {
  return { id: r.id, name: r.name, scope: r.scope, prefix: r.prefix, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt };
}

/** Create a token for `user`; only the SHA-256 of it is stored. */
export async function mintToken(db: Db, user: SessionUser, input: ApiTokenCreateInput): Promise<ApiTokenCreated> {
  const token = randomToken();
  const row: TokenRow = {
    id: newId(),
    sub: user.sub,
    name: input.name,
    scope: input.scope,
    tokenHash: await sha256Hex(token),
    prefix: token.slice(0, API_TOKEN_PREFIX.length + 6),
    createdAt: nowIso(),
    lastUsedAt: null,
    revokedAt: null,
  };
  // Make sure the user row exists (it is normally written at sign-in) so the token resolves later.
  await db
    .insert(users)
    .values({ sub: user.sub, email: user.email, emailVerified: user.emailVerified, name: user.name, picture: user.picture, roles: user.roles, createdAt: row.createdAt, lastLoginAt: row.createdAt })
    .onConflictDoUpdate({ target: users.sub, set: { email: user.email, emailVerified: user.emailVerified, name: user.name, picture: user.picture, roles: user.roles } });
  await db.insert(apiTokens).values(row);
  return { ...toTokenOut(row), token };
}

export async function listTokens(db: Db, sub: string): Promise<ApiTokenOut[]> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.sub, sub), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
  return rows.map(toTokenOut);
}

/** Revoke one of the caller's own tokens; false when it does not exist or is already revoked. */
export async function revokeToken(db: Db, sub: string, id: string): Promise<boolean> {
  const row = await db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.sub, sub), isNull(apiTokens.revokedAt)))
    .get();
  if (!row) return false;
  await db.update(apiTokens).set({ revokedAt: nowIso() }).where(eq(apiTokens.id, id));
  return true;
}

export interface TokenAuth {
  user: SessionUser;
  scope: ApiTokenScope;
  tokenId: string;
}

/**
 * Resolve an `Authorization: Bearer opsec_…` header to its user. Null for a
 * missing header, an unknown or revoked token, or a user the access policy no
 * longer allows. The user comes from the `users` row written at sign-in, so a
 * role change there applies to tokens immediately.
 */
export async function authenticateToken(db: Db, env: Pick<AppVars, "AUTH_MODE" | "ACCESS_ALLOWED_EMAILS">, header: string | undefined): Promise<TokenAuth | null> {
  const m = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
  const token = m?.[1];
  if (!token || !token.startsWith(API_TOKEN_PREFIX)) return null;
  const row = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, await sha256Hex(token)), isNull(apiTokens.revokedAt)))
    .get();
  if (!row) return null;

  let user: SessionUser | null = null;
  if (row.sub === OPEN_USER.sub) {
    user = OPEN_USER;
  } else {
    const u = await db.select().from(users).where(eq(users.sub, row.sub)).get();
    if (u) user = { sub: u.sub, email: u.email, emailVerified: u.emailVerified, name: u.name, picture: u.picture, roles: u.roles };
  }
  if (!user) return null;
  if (authMode(env) === "oidc" && !isAllowed(user, env)) return null;

  if (!row.lastUsedAt || Date.now() - Date.parse(row.lastUsedAt) > LAST_USED_GRANULARITY_MS) {
    await db.update(apiTokens).set({ lastUsedAt: nowIso() }).where(eq(apiTokens.id, row.id));
  }
  return { user, scope: row.scope, tokenId: row.id };
}
