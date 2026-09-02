import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ApiErrorBody, AuthUser } from "@shared/types";
import { signSession } from "../src/worker/lib/session";
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

  it("stores per-user preferences and returns them with the identity", async () => {
    const before = await json<AuthUser>("/api/auth/me");
    expect(before.body.preferences).toEqual({ dashboardShowContactDetails: true });
    const upd = await json<AuthUser>("/api/auth/preferences", { method: "PATCH", body: { dashboardShowContactDetails: false } });
    expect(upd.status).toBe(200);
    expect(upd.body.preferences.dashboardShowContactDetails).toBe(false);
    const after = await json<AuthUser>("/api/auth/me");
    expect(after.body.preferences.dashboardShowContactDetails).toBe(false);
    // Another user is unaffected.
    const other = await apiAs({ sub: "someone-else", roles: ["admin"] }, "/api/auth/me");
    expect(((await other.json()) as AuthUser).preferences.dashboardShowContactDetails).toBe(true);
    const bad = await json<ApiErrorBody>("/api/auth/preferences", { method: "PATCH", body: { dashboardShowContactDetails: "yes" } });
    expect(bad.status).toBe(400);
  });

  it("callback without a login transaction bounces back with an error", async () => {
    const res = await api("/api/auth/callback?code=x&state=y", { anonymous: true, redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("auth_error=");
  });

  it("logout clears the cookie", async () => {
    const res = await api("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("opsec_session=;");
  });
});
