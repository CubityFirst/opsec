import { describe, expect, it } from "vitest";
import type { ApiTokenCreated } from "@shared/schemas/token";
import { SELF } from "cloudflare:test";
import { createContact, createInteraction, json } from "./helpers";

type Rpc = { jsonrpc: string; id: number | string | null; result?: Record<string, unknown>; error?: { code: number; message: string } };
type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

async function token(scope: "read" | "write"): Promise<string> {
  const r = await json<ApiTokenCreated>("/api/tokens", { method: "POST", body: { name: `mcp-${scope}`, scope } });
  return r.body.token;
}

let seq = 0;
async function rpc(tok: string | null, method: string, params?: unknown, opts: { notification?: boolean } = {}) {
  const id = opts.notification ? undefined : ++seq;
  const res = await SELF.fetch("http://opsec.test/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", ...(id !== undefined ? { id } : {}), method, params }),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: (text ? JSON.parse(text) : null) as Rpc | null };
}

const call = async (tok: string, name: string, args: unknown) => {
  const r = await rpc(tok, "tools/call", { name, arguments: args });
  expect(r.status).toBe(200);
  const result = r.body!.result as ToolResult | undefined;
  expect(result, JSON.stringify(r.body)).toBeDefined();
  return { ...result!, text: result!.content[0]!.text };
};

describe("MCP server", () => {
  it("requires an API token", async () => {
    const r = await rpc(null, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain("Bearer");
    expect(r.body?.error?.code).toBe(-32001);
  });

  it("initializes, lists tools by scope, and answers notifications with 202", async () => {
    const read = await token("read");
    const init = await rpc(read, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    expect(init.status).toBe(200);
    expect(init.body!.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "opsec" }, capabilities: { tools: {} } });
    expect(init.headers.get("mcp-protocol-version")).toBe("2025-06-18");

    const note = await rpc(read, "notifications/initialized", {}, { notification: true });
    expect(note.status).toBe(202);

    const list = await rpc(read, "tools/list");
    const names = (list.body!.result!.tools as { name: string }[]).map((t) => t.name);
    expect(names).toContain("search_contacts");
    expect(names).not.toContain("create_contact");

    const write = await token("write");
    const list2 = await rpc(write, "tools/list");
    const names2 = (list2.body!.result!.tools as { name: string; inputSchema: { properties: Record<string, unknown> } }[]);
    expect(names2.map((t) => t.name)).toEqual(expect.arrayContaining(["create_contact", "update_contact", "delete_interaction", "create_interaction"]));
    expect(names2.find((t) => t.name === "delete_interaction")!.inputSchema.properties).toHaveProperty("confirm");

    const unknown = await rpc(read, "nope/method");
    expect(unknown.body!.error!.code).toBe(-32601);
    const ping = await rpc(read, "ping");
    expect(ping.body!.result).toEqual({});
  });

  it("runs read tools", async () => {
    const read = await token("read");
    const a = await createContact({ firstName: "Mcp", lastName: "Reader", nickname: "mcpnick" });
    const r = await call(read, "search_contacts", { q: "mcpnick" });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.text).items.map((x: { id: string }) => x.id)).toContain(a.id);
    const bad = await call(read, "get_contact", { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
    expect(bad.isError).toBe(true);
  });

  it("applies write tools immediately, with confirm for destructive ones, and refuses read tokens", async () => {
    const write = await token("write");
    const read = await token("read");

    const created = await call(write, "create_contact", { kind: "organization", firstName: "MCP Org" });
    expect(created.isError, created.text).toBeFalsy();
    const org = JSON.parse(created.text) as { applied: string; result: { id: string; displayName: string } };
    expect(org.result.displayName).toBe("MCP Org");
    const fetched = await json<{ kind: string }>(`/api/contacts/${org.result.id}`);
    expect(fetched.body.kind).toBe("organization");

    const p = await createContact({ firstName: "Mcp", lastName: "Writer" });
    const upd = await call(write, "update_contact", { contactId: p.id, jobTitle: "Engineer", employerContactId: org.result.id });
    expect(upd.isError, upd.text).toBeFalsy();
    const detail = await json<{ jobTitle: string; employer: { id: string } | null }>(`/api/contacts/${p.id}`);
    expect(detail.body.jobTitle).toBe("Engineer");
    expect(detail.body.employer?.id).toBe(org.result.id);

    const logged = await call(write, "create_interaction", { contactIds: [p.id], type: "call", summary: "Via MCP" });
    expect(logged.isError, logged.text).toBeFalsy();
    const interactions = await json<{ items: { summary: string }[] }>(`/api/contacts/${p.id}/interactions`);
    expect(interactions.body.items.map((i) => i.summary)).toContain("Via MCP");

    const x = await createInteraction([p.id], { summary: "To delete", occurredAt: "2024-01-01T00:00:00.000Z" });
    const refused = await call(write, "delete_interaction", { interactionId: x.id });
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(/confirm: true/);
    expect((await json(`/api/interactions/${x.id}`)).status).toBe(200);
    const deleted = await call(write, "delete_interaction", { interactionId: x.id, confirm: true });
    expect(deleted.isError, deleted.text).toBeFalsy();
    expect((await json(`/api/interactions/${x.id}`)).status).toBe(404);

    const denied = await call(read, "create_contact", { kind: "person", firstName: "Nope" });
    expect(denied.isError).toBe(true);
    expect(denied.text).toMatch(/read-only/);
  });
});
