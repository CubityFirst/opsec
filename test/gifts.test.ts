import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { AskEvent, AskProposal } from "@shared/schemas/ask";
import type { FeedResult, GiftListResult, GiftOut } from "@shared/types";
import { getDb } from "../src/worker/db";
import { ByteBudget } from "../src/worker/services/ask/limits";
import { executeTool, type ToolCtx } from "../src/worker/services/ask/tools";
import { api, createContact, json } from "./helpers";

async function createGift(contactId: string, extra: Record<string, unknown> = {}): Promise<GiftOut> {
  const { status, body } = await json<GiftOut>(`/api/contacts/${contactId}/gifts`, {
    method: "POST",
    body: { name: "Bottle of Islay whisky", status: "idea", ...extra },
  });
  if (status !== 201) throw new Error(`createGift failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

describe("gifts", () => {
  it("creates, updates, gives, reverts and deletes a gift, logging activity", async () => {
    const a = await createContact({ firstName: "Giftee" });
    const idea = await createGift(a.id, { occasion: "40th birthday", price: "£40", url: "https://example.com/whisky", notes: "The peaty one" });
    expect(idea).toMatchObject({ status: "idea", givenOn: null, occasion: "40th birthday", price: "£40", url: "https://example.com/whisky", notes: "The peaty one" });
    expect(idea.contact.id).toBe(a.id);

    // Given / received default the date to today; ideas never carry one.
    const received = await createGift(a.id, { name: "Socks", status: "received" });
    expect(received.givenOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dated = await createGift(a.id, { name: "Book", status: "given", givenOn: "2025-12-25" });
    expect(dated.givenOn).toBe("2025-12-25");
    const ideaWithDate = await createGift(a.id, { name: "Scarf", status: "idea", givenOn: "2025-12-25" });
    expect(ideaWithDate.givenOn).toBeNull();

    expect((await json(`/api/contacts/${a.id}/gifts`, { method: "POST", body: { name: "", status: "idea" } })).status).toBe(400);
    expect((await json(`/api/contacts/${a.id}/gifts`, { method: "POST", body: { name: "x", status: "lost" } })).status).toBe(400);
    expect((await json("/api/contacts/missing/gifts", { method: "POST", body: { name: "x", status: "idea" } })).status).toBe(404);

    const upd = await json<GiftOut>(`/api/gifts/${idea.id}`, { method: "PATCH", body: { price: "£45", occasion: null } });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ price: "£45", occasion: null, status: "idea" });
    const noop = await json<GiftOut>(`/api/gifts/${idea.id}`, { method: "PATCH", body: { price: "£45" } });
    expect(noop.body.updatedAt).toBe(upd.body.updatedAt);

    // PATCH can change the status too: leaving idea fills in today's date, returning to it clears the date.
    const viaPatch = await json<GiftOut>(`/api/gifts/${ideaWithDate.id}`, { method: "PATCH", body: { status: "received" } });
    expect(viaPatch.body.status).toBe("received");
    expect(viaPatch.body.givenOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const backViaPatch = await json<GiftOut>(`/api/gifts/${ideaWithDate.id}`, { method: "PATCH", body: { status: "idea" } });
    expect(backViaPatch.body).toMatchObject({ status: "idea", givenOn: null });

    expect((await json(`/api/gifts/${idea.id}/revert`, { method: "POST" })).status).toBe(409);
    const given = await json<GiftOut>(`/api/gifts/${idea.id}/give`, { method: "POST", body: { on: "2026-03-01", occasion: "Birthday" } });
    expect(given.status).toBe(200);
    expect(given.body).toMatchObject({ status: "given", givenOn: "2026-03-01", occasion: "Birthday", price: "£45" });
    expect((await json(`/api/gifts/${idea.id}/give`, { method: "POST", body: {} })).status).toBe(409);
    expect((await json(`/api/gifts/${idea.id}/give`, { method: "POST", body: { on: "March" } })).status).toBe(400);

    const reverted = await json<GiftOut>(`/api/gifts/${idea.id}/revert`, { method: "POST" });
    expect(reverted.body).toMatchObject({ status: "idea", givenOn: null, occasion: "Birthday" });

    const feed = await json<FeedResult>(`/api/contacts/${a.id}/activity`);
    const types = feed.body.items.filter((i) => i.kind === "event").map((i) => (i.kind === "event" ? i.event.eventType : ""));
    expect(types).toEqual(expect.arrayContaining(["gift.created", "gift.updated", "gift.given", "gift.reverted"]));
    const givenEvent = feed.body.items.find((i) => i.kind === "event" && i.event.eventType === "gift.given");
    expect(givenEvent && givenEvent.kind === "event" ? givenEvent.event.payload : null).toMatchObject({ v: 1, name: "Bottle of Islay whisky", occasion: "Birthday", on: "2026-03-01" });

    expect((await api(`/api/gifts/${idea.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await json(`/api/gifts/${idea.id}`)).status).toBe(404);
    const feed2 = await json<FeedResult>(`/api/contacts/${a.id}/activity`);
    expect(feed2.body.items.some((i) => i.kind === "event" && i.event.eventType === "gift.deleted")).toBe(true);
  });

  it("lists gifts ideas-first with counts, filters by status, and scopes to a contact", async () => {
    const a = await createContact({ firstName: "Lister", lastName: "Gifts" });
    const b = await createContact({ firstName: "Lister", lastName: "Other" });
    const oldGiven = await createGift(a.id, { name: "old given", status: "given", givenOn: "2020-01-01" });
    const newGiven = await createGift(a.id, { name: "new given", status: "given", givenOn: "2024-06-01" });
    const received = await createGift(a.id, { name: "received", status: "received", givenOn: "2022-01-01" });
    const idea1 = await createGift(a.id, { name: "idea 1" });
    const idea2 = await createGift(a.id, { name: "idea 2" });
    const otherIdea = await createGift(b.id, { name: "other idea" });

    const forA = await json<GiftListResult>(`/api/contacts/${a.id}/gifts`);
    expect(forA.status).toBe(200);
    expect(forA.body.items.map((x) => x.id)).toEqual([idea2.id, idea1.id, newGiven.id, received.id, oldGiven.id]);
    expect(forA.body.counts).toEqual({ idea: 2, given: 2, received: 1 });
    expect(forA.body.total).toBe(5);

    const ideasA = await json<GiftListResult>(`/api/contacts/${a.id}/gifts?status=idea`);
    expect(ideasA.body.items.map((x) => x.id)).toEqual([idea2.id, idea1.id]);
    // Counts always cover the whole contact, whatever the filter.
    expect(ideasA.body.counts.given).toBe(2);

    const allIdeas = await json<GiftListResult>(`/api/gifts?status=idea`);
    const ids = allIdeas.body.items.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining([idea1.id, idea2.id, otherIdea.id]));
    expect(ids).not.toContain(newGiven.id);
    expect(allIdeas.body.items.find((x) => x.id === otherIdea.id)?.contact.displayName).toBe("Lister Other");
    expect((await json("/api/gifts?status=nope")).status).toBe(400);

    // Deleting the contact takes its gifts with it.
    expect((await api(`/api/contacts/${b.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await json(`/api/gifts/${otherIdea.id}`)).status).toBe(404);
  });

  it("read-scoped tokens cannot give a gift", async () => {
    const a = await createContact({ firstName: "Token", lastName: "Gift" });
    const gift = await createGift(a.id);
    const tok = await json<{ token: string }>("/api/tokens", { method: "POST", body: { name: "ro-gifts", scope: "read" } });
    expect(tok.status).toBe(201);
    const h = { authorization: `Bearer ${tok.body.token}` };
    expect((await api(`/api/gifts/${gift.id}`, { anonymous: true, headers: h })).status).toBe(200);
    expect((await api(`/api/gifts/${gift.id}/give`, { anonymous: true, method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({}) })).status).toBe(403);
  });
});

describe("ask tools: gifts", () => {
  const WRITE_METHODS = new Set(["insert", "update", "delete", "batch", "transaction"]);
  function ctx(): ToolCtx & { events: AskEvent[] } {
    const events: AskEvent[] = [];
    const db = new Proxy(getDb(env.DB), {
      get(target, prop, receiver) {
        if (WRITE_METHODS.has(String(prop))) throw new Error(`ask tool attempted a write: ${String(prop)}`);
        return Reflect.get(target, prop, receiver);
      },
    });
    return { db, emit: (e) => void events.push(e), budget: new ByteBudget(), pending: new Map(), events };
  }
  async function run(name: string, input: unknown) {
    const c = ctx();
    const out = await executeTool({ id: `t_${name}`, name, argsJson: JSON.stringify(input) }, c);
    let parsed: any = null;
    if (out.ok) {
      try {
        parsed = JSON.parse(out.content);
      } catch {
        /* text */
      }
    }
    const proposal = c.events.find((e) => e.type === "proposal");
    return { ...out, json: parsed, proposal: proposal && proposal.type === "proposal" ? (proposal.proposal as Extract<AskProposal, { kind: "action" }>) : null };
  }

  it("list_gifts reads and propose_gift drafts add / give / revert / update / remove", async () => {
    const a = await createContact({ firstName: "Ask", lastName: "Giver" });
    const gift = await createGift(a.id, { name: "Tickets to the Globe", price: "£60" });

    const list = await run("list_gifts", { contactId: a.id });
    expect(list.ok, list.summary).toBe(true);
    expect(list.json.items[0]).toMatchObject({ id: gift.id, name: "Tickets to the Globe", price: "£60", status: "idea", contact: { id: a.id } });
    expect(list.json.counts).toEqual({ idea: 1, given: 0, received: 0 });
    const givenOnly = await run("list_gifts", { contactId: a.id, status: "given" });
    expect(givenOnly.json.items).toEqual([]);

    const add = await run("propose_gift", { contactId: a.id, action: "add", name: "Fountain pen", status: "received", givenOn: "2026-01-01", occasion: "Christmas" });
    expect(add.ok, add.summary).toBe(true);
    expect(add.proposal?.title).toBe("Record a gift from Ask Giver");
    expect(add.proposal?.request).toMatchObject({ method: "POST", path: `/api/contacts/${a.id}/gifts`, body: { name: "Fountain pen", status: "received", givenOn: "2026-01-01", occasion: "Christmas" } });
    expect((await run("propose_gift", { contactId: a.id, action: "add", name: "no status" })).ok).toBe(false);

    const give = await run("propose_gift", { contactId: a.id, action: "give", giftId: gift.id, givenOn: "2026-05-05", occasion: "Birthday" });
    expect(give.ok, give.summary).toBe(true);
    expect(give.proposal?.request).toEqual({ method: "POST", path: `/api/gifts/${gift.id}/give`, body: { on: "2026-05-05", occasion: "Birthday" } });
    expect(give.proposal?.changes[0]).toEqual({ label: "Status", from: "Idea", to: "Given" });
    expect((await run("propose_gift", { contactId: a.id, action: "revert", giftId: gift.id })).ok).toBe(false);

    const upd = await run("propose_gift", { contactId: a.id, action: "update", giftId: gift.id, price: "£60", url: "https://example.com" });
    expect(upd.proposal?.request).toEqual({ method: "PATCH", path: `/api/gifts/${gift.id}`, body: { url: "https://example.com" } });
    expect((await run("propose_gift", { contactId: a.id, action: "update", giftId: gift.id, price: "£60" })).ok).toBe(false);

    const rm = await run("propose_gift", { contactId: a.id, action: "remove", giftId: gift.id });
    expect(rm.proposal).toMatchObject({ destructive: true, request: { method: "DELETE", path: `/api/gifts/${gift.id}` } });

    const other = await createContact({ firstName: "Other" });
    expect((await run("propose_gift", { contactId: other.id, action: "remove", giftId: gift.id })).ok).toBe(false);
  });

  it("the MCP server exposes list_gifts and a gift write tool", async () => {
    const tok = await json<{ token: string }>("/api/tokens", { method: "POST", body: { name: "mcp-gifts", scope: "write" } });
    const res = await api("/mcp", {
      anonymous: true,
      method: "POST",
      headers: { authorization: `Bearer ${tok.body.token}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    const names = body.result.tools.map((t) => t.name);
    expect(names).toContain("list_gifts");
    expect(names).toContain("gift");
  });
});
