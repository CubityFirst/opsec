import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { userPreferencesUpdateSchema, withPreferenceDefaults } from "@shared/schemas/preferences";
import { schema } from "../db";
import type { AppEnv } from "../env";
import { ApiError, validationHook } from "../lib/errors";
import {
  NOT_ALLOWED_MESSAGE,
  authInfo,
  authMode,
  clearSessionCookie,
  clearTxCookie,
  isAllowed,
  readSessionCookie,
  readTxCookie,
  safeNext,
  sessionSecret,
  setSessionCookie,
  setTxCookie,
  signSession,
  signTx,
  toAuthUser,
  type SessionUser,
  verifySession,
  verifyTx,
} from "../lib/session";
import { nowIso } from "../lib/time";
import { OIDC_SCOPE, client, getOidcConfig, redirectUri } from "../services/oidc";

const app = new Hono<AppEnv>();

/** Start the Authorization Code + PKCE flow. `?next=` is where to land afterwards. */
/** Public: how sign-in works on this instance (the sign-in page reads it before any session exists). */
app.get("/auth/info", (c) => c.json(authInfo(c.env)));

app.get("/auth/login", async (c) => {
  if (authMode(c.env) === "open") return c.redirect("/");
  let config;
  try {
    config = await getOidcConfig(c.env);
  } catch (e) {
    console.error("OIDC discovery failed", e);
    const message = e instanceof Error ? e.message : "Could not reach the identity provider";
    return c.redirect(`/?auth_error=${encodeURIComponent(message)}`, 302);
  }
  const verifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(verifier);
  const state = client.randomState();
  const nonce = client.randomNonce();
  const next = safeNext(c.req.query("next"));

  setTxCookie(c, await signTx({ verifier, state, nonce, next }, sessionSecret(c.env)));

  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(c.req.url),
    scope: OIDC_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return c.redirect(url.href, 302);
});

/**
 * Exchange the code, verify the id_token (signature via JWKS, iss, aud, exp,
 * nonce — all performed by openid-client), then start our own session.
 */
app.get("/auth/callback", async (c) => {
  if (authMode(c.env) === "open") return c.redirect("/");
  const txToken = readTxCookie(c);
  const tx = txToken ? await verifyTx(txToken, sessionSecret(c.env)) : null;
  clearTxCookie(c);
  if (!tx) return c.redirect(`/?auth_error=${encodeURIComponent("Sign-in session expired. Please try again.")}`, 302);

  try {
    const config = await getOidcConfig(c.env);
    const tokens = await client.authorizationCodeGrant(config, new URL(c.req.url), {
      pkceCodeVerifier: tx.verifier,
      expectedState: tx.state,
      expectedNonce: tx.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims) throw new Error("No id_token in token response");

    // Roles normally arrive in the id_token; fall back to userinfo if the provider omits them there.
    let roles = stringArray(claims.roles);
    let email = optionalString(claims.email);
    let emailVerified = claims.email_verified === true;
    let name = optionalString(claims.name);
    let picture = optionalString(claims.picture);
    if (roles === null || email === null || name === null) {
      const info = await client.fetchUserInfo(config, tokens.access_token, claims.sub);
      roles ??= stringArray(info.roles);
      if (email === null) {
        // Take the address and its verified flag from the same source.
        email = optionalString(info.email);
        emailVerified = info.email_verified === true;
      }
      name ??= optionalString(info.name);
      picture ??= optionalString(info.picture);
    }

    const user: SessionUser = { sub: claims.sub, email, emailVerified, name, picture, roles: roles ?? [] };
    if (!isAllowed(user, c.env)) {
      console.warn("Sign-in denied by access policy", { sub: user.sub, email: user.email, roles: user.roles });
      return c.redirect(`/?auth_error=${encodeURIComponent(NOT_ALLOWED_MESSAGE)}`, 302);
    }
    const now = nowIso();
    await c
      .get("db")
      .insert(schema.users)
      .values({ sub: user.sub, email, emailVerified, name, picture, roles: user.roles, createdAt: now, lastLoginAt: now })
      .onConflictDoUpdate({ target: schema.users.sub, set: { email, emailVerified, name, picture, roles: user.roles, lastLoginAt: now } });

    setSessionCookie(c, await signSession(user, sessionSecret(c.env)));
    return c.redirect(tx.next, 302);
  } catch (e) {
    // Log the class and message only: provider errors can carry the callback params or response body.
    console.error("OIDC callback failed", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    const message = e instanceof ApiError ? e.message : "Sign-in failed. Please try again.";
    return c.redirect(`/?auth_error=${encodeURIComponent(message)}`, 302);
  }
});

app.get("/auth/me", async (c) => {
  const user = c.get("user");
  if (!user) {
    // A cookie that verifies but fails the access policy: clear it and say why.
    const token = readSessionCookie(c);
    if (token && c.env.SESSION_SECRET && (await verifySession(token, c.env.SESSION_SECRET))) {
      clearSessionCookie(c);
      throw ApiError.forbidden(NOT_ALLOWED_MESSAGE);
    }
    throw ApiError.unauthorized();
  }
  return c.json(toAuthUser(user, await loadPreferences(c.get("db"), user.sub), c.env));
});

/** Merge a partial preferences update into the user's stored preferences. */
app.patch("/auth/preferences", zValidator("json", userPreferencesUpdateSchema, validationHook), async (c) => {
  const user = c.get("user");
  if (!user) throw ApiError.unauthorized();
  const db = c.get("db");
  const merged = { ...withPreferenceDefaults(await loadPreferences(db, user.sub)), ...c.req.valid("json") };
  const now = nowIso();
  await db
    .insert(schema.users)
    .values({
      sub: user.sub,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      picture: user.picture,
      roles: user.roles,
      preferences: merged,
      createdAt: now,
      lastLoginAt: now,
    })
    .onConflictDoUpdate({ target: schema.users.sub, set: { preferences: merged } });
  return c.json(toAuthUser(user, merged, c.env));
});

async function loadPreferences(db: AppEnv["Variables"]["db"], sub: string): Promise<unknown> {
  const row = await db.select({ preferences: schema.users.preferences }).from(schema.users).where(eq(schema.users.sub, sub)).get();
  return row?.preferences ?? {};
}

app.post("/auth/logout", async (c) => {
  if (authMode(c.env) === "open") return c.json({ ok: true, logoutUrl: null });
  clearSessionCookie(c);
  let logoutUrl: string | null = null;
  try {
    const config = await getOidcConfig(c.env);
    if (config.serverMetadata().end_session_endpoint) {
      logoutUrl = client.buildEndSessionUrl(config, { post_logout_redirect_uri: new URL(c.req.url).origin }).href;
    }
  } catch {
    /* provider unreachable: local logout still succeeds */
  }
  return c.json({ ok: true, logoutUrl });
});

function optionalString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function stringArray(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
}

export default app;
