import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTACT_COLUMNS } from "@shared/contact-columns";
import type { ApiErrorBody, AuthUser } from "@shared/types";
import { safeNext, signSession } from "../src/worker/lib/session";
import { providerFetch } from "../src/worker/services/oidc";
import { FAKE_ISSUER, type FakeAuthCode, fakeAuthCode } from "./fake-idp";
import { api, apiAs, createContact, json } from "./helpers";

function setCookie(res: Response, name: string): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
}

function cookieValue(res: Response, name: string): string | undefined {
  return setCookie(res, name)?.split(";")[0].slice(name.length + 1);
}

/** Run /auth/login, then the callback the provider would send back, against the fake IDP. */
async function signIn(claims: FakeAuthCode["claims"], opts: { badSignature?: boolean; next?: string } = {}): Promise<Response> {
  const login = await api(`/api/auth/login?next=${encodeURIComponent(opts.next ?? "/contacts")}`, { anonymous: true, redirect: "manual" });
  const authorize = new URL(login.headers.get("location")!);
  const code = fakeAuthCode({
    nonce: authorize.searchParams.get("nonce")!,
    codeChallenge: authorize.searchParams.get("code_challenge")!,
    claims,
    badSignature: opts.badSignature,
  });
  const query = new URLSearchParams({ code, state: authorize.searchParams.get("state")!, iss: FAKE_ISSUER });
  return api(`/api/auth/callback?${query}`, { anonymous: true, redirect: "manual", headers: { cookie: `opsec_oidc_tx=${cookieValue(login, "opsec_oidc_tx")}` } });
}

describe("auth", () => {
  it("rejects API calls without a session", async () => {
    const res = await api("/api/contacts", { anonymous: true });
    expect(res.status).toBe(401);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe("unauthorized");
    expect((await api("/api/auth/me", { anonymous: true })).status).toBe(401);
    // Public routes stay reachable.
    expect((await api("/api/health", { anonymous: true })).status).toBe(200);
  });

  it("rejects tampered and expired session cookies", async () => {
    const forged = await signSession({ sub: "x", email: null, emailVerified: false, name: null, picture: null, roles: [] }, "wrong-secret");
    expect((await api("/api/auth/me", { anonymous: true, headers: { cookie: `opsec_session=${forged}` } })).status).toBe(401);
    const expired = await signSession({ sub: "x", email: null, emailVerified: false, name: null, picture: null, roles: [] }, env.SESSION_SECRET, -10);
    expect((await api("/api/auth/me", { anonymous: true, headers: { cookie: `opsec_session=${expired}` } })).status).toBe(401);
  });

  it("returns the verified identity for a valid session, with isAdmin derived from roles", async () => {
    const admin = await json<AuthUser>("/api/auth/me");
    expect(admin.status).toBe(200);
    expect(admin.body).toMatchObject({ sub: "test-admin", roles: ["admin"], isAdmin: true });

    const member = await apiAs({ sub: "member-1", roles: ["member"], email: "allowed@example.com", emailVerified: true }, "/api/auth/me");
    expect(((await member.json()) as AuthUser).isAdmin).toBe(false);
  });

  it("gates admin-only routes on the admin role", async () => {
    const c = await createContact({ firstName: "Gated" });
    const member = { sub: "member-1", roles: [], email: "allowed@example.com", emailVerified: true };
    const denied = await apiAs(member, `/api/contacts/${c.id}`, { method: "DELETE" });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as ApiErrorBody).error.code).toBe("forbidden");
    // Non-admins can still do ordinary work.
    expect((await apiAs(member, `/api/contacts/${c.id}`)).status).toBe(200);
    expect((await api(`/api/contacts/${c.id}`, { method: "DELETE" })).status).toBe(204);
  });

  it("only admits admins and allowlisted verified emails", async () => {
    // Admin without any email: allowed.
    expect((await apiAs({ sub: "a", roles: ["admin"] }, "/api/contacts")).status).toBe(200);
    // Allowlisted verified email, no roles: allowed (case-insensitive match).
    expect((await apiAs({ sub: "b", email: "ALLOWED@example.com", emailVerified: true }, "/api/contacts")).status).toBe(200);
    expect((await apiAs({ sub: "b2", email: "also.allowed@example.com", emailVerified: true }, "/api/contacts")).status).toBe(200);
    // Allowlisted but unverified email: denied.
    expect((await apiAs({ sub: "c", email: "allowed@example.com", emailVerified: false }, "/api/contacts")).status).toBe(401);
    // Ordinary user with some other email: denied everywhere, and /me explains why.
    const outsider = { sub: "d", email: "someone@example.com", emailVerified: true, roles: ["user"] };
    expect((await apiAs(outsider, "/api/contacts")).status).toBe(401);
    const me = await apiAs(outsider, "/api/auth/me");
    expect(me.status).toBe(403);
    expect(((await me.json()) as ApiErrorBody).error.message).toContain("not allowed");
    expect(me.headers.get("set-cookie")).toContain("opsec_session=;");
  });

  it("records the acting user's sub in the activity log", async () => {
    const c = await createContact({ firstName: "Actor" });
    const feed = await json<{ items: { kind: string; event?: { actor: string } }[] }>(`/api/contacts/${c.id}/activity`);
    const created = feed.body.items.find((i) => i.kind === "event");
    expect(created?.event?.actor).toBe("test-admin");
  });

  it("returns per-user preferences with the identity and accepts a preferences patch", async () => {
    const before = await json<AuthUser>("/api/auth/me");
    expect(before.body.preferences.contactColumns).toEqual(DEFAULT_CONTACT_COLUMNS);
    expect(before.body.preferences.outOfTouchIncludeNever).toBe(false);
    const upd = await json<AuthUser>("/api/auth/preferences", { method: "PATCH", body: { contactColumns: ["country", "lastSpoke"], unknownKey: true } });
    expect(upd.status).toBe(200);
    // A patch merges into the stored preferences: the untouched keys keep their values.
    expect(upd.body.preferences).toEqual({ contactColumns: ["country", "lastSpoke"], outOfTouchIncludeNever: false });
    // The choice belongs to the user, not the session or the browser.
    const after = await json<AuthUser>("/api/auth/me");
    expect(after.body.preferences.contactColumns).toEqual(["country", "lastSpoke"]);
    const other = await apiAs({ sub: "someone-else", roles: ["admin"] }, "/api/auth/me");
    expect(((await other.json()) as AuthUser).preferences.contactColumns).toEqual(DEFAULT_CONTACT_COLUMNS);
    // Reverting to the default is just another patch.
    const reset = await json<AuthUser>("/api/auth/preferences", { method: "PATCH", body: { contactColumns: DEFAULT_CONTACT_COLUMNS } });
    expect(reset.body.preferences.contactColumns).toEqual(DEFAULT_CONTACT_COLUMNS);
    const unknownColumn = await json<ApiErrorBody>("/api/auth/preferences", { method: "PATCH", body: { contactColumns: ["nope"] } });
    expect(unknownColumn.status).toBe(400);
    // The dashboard's "Out of touch" switch is another key on the same row.
    const quiet = await json<AuthUser>("/api/auth/preferences", { method: "PATCH", body: { outOfTouchIncludeNever: true } });
    expect(quiet.body.preferences).toEqual({ contactColumns: DEFAULT_CONTACT_COLUMNS, outOfTouchIncludeNever: true });
    await json<AuthUser>("/api/auth/preferences", { method: "PATCH", body: { outOfTouchIncludeNever: false } });
    const bad = await json<ApiErrorBody>("/api/auth/preferences", { method: "PATCH", body: "nope" });
    expect(bad.status).toBe(400);
  });

  it("callback without a login transaction bounces back with an error", async () => {
    const res = await api("/api/auth/callback?code=x&state=y", { anonymous: true, redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("auth_error=");
  });

  it("talks to the provider through the IDP binding the author's instance deploys", async () => {
    // cloudflare.config.ts mode "prod" must bind IDP, the name providerFetch reads, to the provider Worker.
    expect(env.TEST_PROD_SERVICE_BINDINGS.IDP).toBe("cubityfirst-auth");
    // The fake IDP binding (vitest.config.ts) tags its answers; a public fetch would not carry the header.
    const res = await providerFetch(env)(`${FAKE_ISSUER}/.well-known/openid-configuration`, { method: "GET", headers: {}, body: undefined, redirect: "manual" });
    expect(res.headers.get("x-test-idp")).toBe("1");
    expect(((await res.json()) as { issuer: string }).issuer).toBe(FAKE_ISSUER);
  });

  it("login redirects to the discovered authorization endpoint with PKCE, state and nonce", async () => {
    const res = await api("/api/auth/login?next=/contacts", { anonymous: true, redirect: "manual" });
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location")!);
    expect(`${url.origin}${url.pathname}`).toBe(`${FAKE_ISSUER}/oauth/authorize`);
    expect(url.searchParams.get("client_id")).toBe("test-client");
    expect(url.searchParams.get("redirect_uri")).toBe("http://opsec.test/api/auth/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    for (const p of ["code_challenge", "state", "nonce"]) expect(url.searchParams.get(p)).toBeTruthy();
    expect(setCookie(res, "opsec_oidc_tx")).toContain("Path=/api/auth");
  });

  it("signs in end to end and keeps the id_token for sign-out", async () => {
    const res = await signIn({ sub: "idp-user-1", email: "allowed@example.com", email_verified: true, name: "Signed In", roles: ["user"] });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/contacts");
    expect(setCookie(res, "opsec_oidc_tx")).toMatch(/^opsec_oidc_tx=;/);
    const session = cookieValue(res, "opsec_session");
    expect(session).toBeTruthy();
    const idToken = cookieValue(res, "opsec_id_token")!;
    expect(idToken.split(".")).toHaveLength(3);
    const idCookie = setCookie(res, "opsec_id_token")!;
    for (const attr of ["Path=/api/auth/logout", "HttpOnly", "SameSite=Lax"]) expect(idCookie).toContain(attr);

    const me = await api("/api/auth/me", { anonymous: true, headers: { cookie: `opsec_session=${session}` } });
    expect(await me.json()).toMatchObject({ sub: "idp-user-1", email: "allowed@example.com", roles: ["user"], isAdmin: false });

    const out = await api("/api/auth/logout", { method: "POST", anonymous: true, headers: { cookie: `opsec_session=${session}; opsec_id_token=${idToken}` } });
    const { logoutUrl } = (await out.json()) as { logoutUrl: string };
    expect(new URL(logoutUrl).searchParams.get("id_token_hint")).toBe(idToken);
  });

  it("refuses an id_token whose signature does not match the provider's keys", async () => {
    const res = await signIn({ sub: "idp-user-2", email: "allowed@example.com", email_verified: true, name: "Forged", roles: ["admin"] }, { badSignature: true });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("auth_error=");
    expect(cookieValue(res, "opsec_session")).toBeFalsy();
    expect(cookieValue(res, "opsec_id_token")).toBeFalsy();
  });

  it("logout clears the session and hands back the provider's end-session URL", async () => {
    const res = await api("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    expect(setCookie(res, "opsec_session")).toMatch(/^opsec_session=;.*Path=\//);
    expect(setCookie(res, "opsec_id_token")).toMatch(/^opsec_id_token=;.*Path=\/api\/auth\/logout/);
    const { logoutUrl } = (await res.json()) as { logoutUrl: string | null };
    const url = new URL(logoutUrl!);
    expect(`${url.origin}${url.pathname}`).toBe(`${FAKE_ISSUER}/oauth/logout`);
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe("http://opsec.test/signed-out");
    expect(url.searchParams.get("client_id")).toBe("test-client");
    // No id_token kept from sign-in: the provider will ask before signing out.
    expect(url.searchParams.has("id_token_hint")).toBe(false);
  });

  it("only accepts a normalised same-origin path as the post-sign-in destination", async () => {
    expect(safeNext("/contacts?q=a")).toBe("/contacts?q=a");
    expect(safeNext("/signed-outside")).toBe("/signed-outside");
    expect(safeNext("/contacts/./x/../y")).toBe("/contacts/y");
    const refused = [
      undefined,
      "",
      "contacts",
      "https://evil.example/",
      "//evil.example",
      "/\\evil.example",
      // Browsers drop tabs and newlines when resolving a Location: these would become //evil.example.
      "/\t/evil.example",
      "/\n/evil.example",
      "/.//evil.example",
      "/\t/x:999999",
      "/api",
      "/api/auth/login",
      "/x/../api/auth/login",
      "/signed-out",
      "/signed-out/",
      "/signed-out?x=1",
    ];
    for (const raw of refused) expect(safeNext(raw), JSON.stringify(raw)).toBe("/");
    // A destination that cannot be parsed falls back instead of failing the login.
    const res = await api(`/api/auth/login?next=${encodeURIComponent("/\t/x:999999")}`, { anonymous: true, redirect: "manual" });
    expect(res.status).toBe(302);
  });
});
