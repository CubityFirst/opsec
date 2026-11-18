import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTACT_COLUMNS } from "@shared/contact-columns";
import type { ApiErrorBody, AuthUser } from "@shared/types";
import { safeNext, signSession } from "../src/worker/lib/session";
import { providerFetch } from "../src/worker/services/oidc";
import { api, apiAs, createContact, json } from "./helpers";

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

  it("sends issuer-host requests through the IDP service binding", async () => {
    // The fake IDP binding (vitest.config.ts) tags its answers; a public fetch would not carry the header.
    const res = await providerFetch(env)("https://auth.cubityfir.st/.well-known/openid-configuration", { method: "GET", headers: {}, body: undefined, redirect: "manual" });
    expect(res.headers.get("x-test-idp")).toBe("1");
    expect(((await res.json()) as { issuer: string }).issuer).toBe("https://auth.cubityfir.st");
  });

  it("login redirects to the discovered authorization endpoint with PKCE, state and nonce", async () => {
    const res = await api("/api/auth/login?next=/contacts", { anonymous: true, redirect: "manual" });
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location")!);
    expect(`${url.origin}${url.pathname}`).toBe("https://auth.cubityfir.st/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-client");
    expect(url.searchParams.get("redirect_uri")).toBe("http://opsec.test/api/auth/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    for (const p of ["code_challenge", "state", "nonce"]) expect(url.searchParams.get(p)).toBeTruthy();
    expect(res.headers.get("set-cookie")).toContain("opsec_oidc_tx=");
  });

  it("logout clears the session and hands back the provider's end-session URL", async () => {
    const res = await api("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("opsec_session=;");
    expect(setCookie).toContain("opsec_id_token=;");
    const { logoutUrl } = (await res.json()) as { logoutUrl: string | null };
    const url = new URL(logoutUrl!);
    expect(`${url.origin}${url.pathname}`).toBe("https://auth.cubityfir.st/oauth/logout");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe("http://opsec.test/signed-out");
    expect(url.searchParams.get("client_id")).toBe("test-client");
    // No id_token kept from sign-in: the provider will ask before signing out.
    expect(url.searchParams.has("id_token_hint")).toBe(false);
  });

  it("never sends a fresh sign-in back to the signed-out page", () => {
    expect(safeNext("/signed-out")).toBe("/");
    expect(safeNext("/signed-out?x=1")).toBe("/");
    expect(safeNext("/contacts?q=a")).toBe("/contacts?q=a");
    expect(safeNext("/signed-outside")).toBe("/signed-outside");
  });

  it("logout passes the id_token from sign-in as id_token_hint", async () => {
    const session = await signSession({ sub: "test-admin", email: null, emailVerified: false, name: null, picture: null, roles: ["admin"] }, env.SESSION_SECRET);
    const res = await api("/api/auth/logout", { method: "POST", headers: { cookie: `opsec_session=${session}; opsec_id_token=header.payload.signature` } });
    const { logoutUrl } = (await res.json()) as { logoutUrl: string };
    expect(new URL(logoutUrl).searchParams.get("id_token_hint")).toBe("header.payload.signature");
  });
});
