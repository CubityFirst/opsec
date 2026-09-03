import { describe, expect, it } from "vitest";
import type { ApiTokenCreated, ApiTokenOut } from "@shared/schemas/token";
import { SELF } from "cloudflare:test";
import { api, createContact, json } from "./helpers";

const bearer = (token: string, path: string, init?: RequestInit) =>
  SELF.fetch(`http://opsec.test${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers as Record<string, string>) } });

describe("API tokens", () => {
  it("mints, lists, uses and revokes tokens", async () => {
    const created = await json<ApiTokenCreated>("/api/tokens", { method: "POST", body: { name: "laptop", scope: "read" } });
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^opsec_[A-Za-z0-9_-]{40,}$/);
    expect(created.body.scope).toBe("read");

    const list = await json<{ items: ApiTokenOut[] }>("/api/tokens");
    const mine = list.body.items.find((t) => t.id === created.body.id)!;
    expect(mine).toMatchObject({ name: "laptop", scope: "read", lastUsedAt: null });
    expect(JSON.stringify(list.body)).not.toContain(created.body.token);

    const a = await createContact({ firstName: "Token", lastName: "Person" });
    const read = await bearer(created.body.token, `/api/contacts/${a.id}`);
    expect(read.status).toBe(200);
    expect(((await read.json()) as { id: string }).id).toBe(a.id);

    const after = await json<{ items: ApiTokenOut[] }>("/api/tokens");
    expect(after.body.items.find((t) => t.id === created.body.id)!.lastUsedAt).not.toBeNull();

    const write = await bearer(created.body.token, "/api/tags", { method: "POST", body: JSON.stringify({ name: "via-token" }) });
    expect(write.status).toBe(403);

    const revoked = await api(`/api/tokens/${created.body.id}`, { method: "DELETE" });
    expect(revoked.status).toBe(204);
    expect((await bearer(created.body.token, `/api/contacts/${a.id}`)).status).toBe(401);
    expect((await api(`/api/tokens/${created.body.id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("write tokens can change data but never manage tokens", async () => {
    const created = await json<ApiTokenCreated>("/api/tokens", { method: "POST", body: { name: "script", scope: "write" } });
    const res = await bearer(created.body.token, "/api/tags", { method: "POST", body: JSON.stringify({ name: "via-write-token" }) });
    expect(res.status).toBe(201);
    expect((await bearer(created.body.token, "/api/tokens")).status).toBe(403);
    expect((await bearer(created.body.token, "/api/tokens", { method: "POST", body: JSON.stringify({ name: "x", scope: "write" }) })).status).toBe(403);
  });

  it("rejects garbage and missing tokens", async () => {
    expect((await bearer("opsec_nope", "/api/contacts")).status).toBe(401);
    expect((await bearer("", "/api/contacts")).status).toBe(401);
    expect((await api("/api/tokens", { anonymous: true })).status).toBe(401);
  });
});
