import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { AskEvent, AskProposal } from "@shared/schemas/ask";
import type { BetListResult, BetOut, FeedResult } from "@shared/types";
import { getDb } from "../src/worker/db";
import { ByteBudget } from "../src/worker/services/ask/limits";
import { executeTool, type ToolCtx } from "../src/worker/services/ask/tools";
import { api, createContact, json } from "./helpers";

async function createBet(contactId: string, extra: Record<string, unknown> = {}): Promise<BetOut> {
  const { status, body } = await json<BetOut>(`/api/contacts/${contactId}/bets`, {
    method: "POST",
    body: { prediction: "It will not rain on Saturday", wager: "a pint", reviewOn: "2999-01-01", ...extra },
  });
  if (status !== 201) throw new Error(`createBet failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

describe("bets", () => {
  it("creates, updates, settles, reopens and deletes a bet, logging activity", async () => {
    const a = await createContact({ firstName: "Punter" });
    const bet = await createBet(a.id, { details: "Loser buys the first round" });
    expect(bet).toMatchObject({ status: "open", outcome: null, wager: "a pint", reviewOn: "2999-01-01", settledAt: null });
    expect(bet.madeOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(bet.contact.id).toBe(a.id);

    const badDate = await json(`/api/contacts/${a.id}/bets`, { method: "POST", body: { prediction: "x", reviewOn: "2000-01-01", madeOn: "2001-01-01" } });
    expect(badDate.status).toBe(400);
    const badShape = await json(`/api/contacts/${a.id}/bets`, { method: "POST", body: { prediction: "", reviewOn: "next week" } });
    expect(badShape.status).toBe(400);
    expect((await json("/api/contacts/missing/bets", { method: "POST", body: { prediction: "x", reviewOn: "2999-01-01" } })).status).toBe(404);

    const upd = await json<BetOut>(`/api/bets/${bet.id}`, { method: "PATCH", body: { wager: "£10", reviewOn: "2999-02-01" } });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ wager: "£10", reviewOn: "2999-02-01", status: "open" });
    const noop = await json<BetOut>(`/api/bets/${bet.id}`, { method: "PATCH", body: { wager: "£10" } });
    expect(noop.body.updatedAt).toBe(upd.body.updatedAt);
    expect((await json(`/api/bets/${bet.id}`, { method: "PATCH", body: { reviewOn: "1999-01-01" } })).status).toBe(400);

    expect((await json(`/api/bets/${bet.id}/reopen`, { method: "POST" })).status).toBe(409);
    expect((await json(`/api/bets/${bet.id}/settle`, { method: "POST", body: { outcome: "draw" } })).status).toBe(400);
    const settled = await json<BetOut>(`/api/bets/${bet.id}/settle`, { method: "POST", body: { outcome: "them", note: "It poured all afternoon" } });
    expect(settled.status).toBe(200);
    expect(settled.body).toMatchObject({ status: "settled", outcome: "them", settledNote: "It poured all afternoon" });
    expect(settled.body.settledAt).not.toBeNull();

    const reopened = await json<BetOut>(`/api/bets/${bet.id}/reopen`, { method: "POST" });
    expect(reopened.body).toMatchObject({ status: "open", outcome: null, settledAt: null, settledNote: null });

    const feed = await json<FeedResult>(`/api/contacts/${a.id}/activity`);
    const types = feed.body.items.filter((i) => i.kind === "event").map((i) => (i.kind === "event" ? i.event.eventType : ""));
    expect(types).toEqual(expect.arrayContaining(["bet.created", "bet.updated", "bet.settled", "bet.reopened"]));
    const settledEvent = feed.body.items.find((i) => i.kind === "event" && i.event.eventType === "bet.settled");
    expect(settledEvent && settledEvent.kind === "event" ? settledEvent.event.payload : null).toMatchObject({ v: 1, outcome: "them", note: "It poured all afternoon" });

    expect((await api(`/api/bets/${bet.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await json(`/api/bets/${bet.id}`)).status).toBe(404);
    const feed2 = await json<FeedResult>(`/api/contacts/${a.id}/activity`);
    expect(feed2.body.items.some((i) => i.kind === "event" && i.event.eventType === "bet.deleted")).toBe(true);
  });

  it("lists bets open-first with a record, filters by status and dueBy, and scopes to a contact", async () => {
    const a = await createContact({ firstName: "Lister", lastName: "One" });
    const b = await createContact({ firstName: "Lister", lastName: "Two" });
    const later = await createBet(a.id, { prediction: "later", reviewOn: "2999-06-01" });
    const soon = await createBet(a.id, { prediction: "soon", reviewOn: "2999-03-01" });
    const overdue = await createBet(a.id, { prediction: "overdue", madeOn: "2000-01-01", reviewOn: "2000-02-01" });
    const won = await createBet(a.id, { prediction: "won" });
    await json(`/api/bets/${won.id}/settle`, { method: "POST", body: { outcome: "me" } });
    const lost = await createBet(b.id, { prediction: "lost" });
    await json(`/api/bets/${lost.id}/settle`, { method: "POST", body: { outcome: "them" } });

    const forA = await json<BetListResult>(`/api/contacts/${a.id}/bets`);
    expect(forA.status).toBe(200);
    expect(forA.body.items.map((x) => x.id)).toEqual([overdue.id, soon.id, later.id, won.id]);
    expect(forA.body.record).toEqual({ open: 3, won: 1, lost: 0, void: 0 });
    expect(forA.body.total).toBe(4);

    const openA = await json<BetListResult>(`/api/contacts/${a.id}/bets?status=open`);
    expect(openA.body.items.map((x) => x.id)).toEqual([overdue.id, soon.id, later.id]);
    // The record always covers the whole contact, so the page can show it whatever the filter.
    expect(openA.body.record.won).toBe(1);

    const settledA = await json<BetListResult>(`/api/contacts/${a.id}/bets?status=settled`);
    expect(settledA.body.items.map((x) => x.id)).toEqual([won.id]);

    const due = await json<BetListResult>(`/api/bets?dueBy=2999-03-01`);
    const dueIds = due.body.items.map((x) => x.id);
    expect(dueIds).toContain(overdue.id);
    expect(dueIds).toContain(soon.id);
    expect(dueIds).not.toContain(later.id);
    expect(dueIds).not.toContain(won.id);
    expect(dueIds.indexOf(overdue.id)).toBeLessThan(dueIds.indexOf(soon.id));

    const all = await json<BetListResult>(`/api/bets?status=settled`);
    expect(all.body.items.map((x) => x.id)).toEqual(expect.arrayContaining([won.id, lost.id]));
    expect(all.body.items.find((x) => x.id === lost.id)?.contact.displayName).toBe("Lister Two");
    expect((await json("/api/bets?status=nope")).status).toBe(400);

    // Deleting the contact takes its bets with it.
    expect((await api(`/api/contacts/${b.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await json(`/api/bets/${lost.id}`)).status).toBe(404);
  });

  it("read-scoped tokens cannot settle a bet", async () => {
    const a = await createContact({ firstName: "Token", lastName: "Bet" });
    const bet = await createBet(a.id);
    const tok = await json<{ token: string }>("/api/tokens", { method: "POST", body: { name: "ro", scope: "read" } });
    expect(tok.status).toBe(201);
    const h = { authorization: `Bearer ${tok.body.token}` };
    expect((await api(`/api/bets/${bet.id}`, { anonymous: true, headers: h })).status).toBe(200);
    expect((await api(`/api/bets/${bet.id}/settle`, { anonymous: true, method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ outcome: "me" }) })).status).toBe(403);
  });
});

describe("ask tools: bets", () => {
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

  it("list_bets reads and propose_bet drafts add / settle / reopen / update / remove", async () => {
    const a = await createContact({ firstName: "Ask", lastName: "Bettor" });
    const bet = await createBet(a.id, { prediction: "Jo gets more than 10,000 votes", wager: "dinner" });

    const list = await run("list_bets", { contactId: a.id });
    expect(list.ok, list.summary).toBe(true);
    expect(list.json.items[0]).toMatchObject({ id: bet.id, prediction: "Jo gets more than 10,000 votes", wager: "dinner", status: "open", with: { id: a.id } });
    expect(list.json.record).toEqual({ open: 1, won: 0, lost: 0, void: 0 });
    const due = await run("list_bets", { dueBy: "2000-01-01" });
    expect(due.json.items.map((x: { id: string }) => x.id)).not.toContain(bet.id);

    const add = await run("propose_bet", { contactId: a.id, action: "add", prediction: "It won't rain", wager: "£5", reviewOn: "2999-05-05" });
    expect(add.ok, add.summary).toBe(true);
    expect(add.proposal?.request).toMatchObject({ method: "POST", path: `/api/contacts/${a.id}/bets`, body: { prediction: "It won't rain", wager: "£5", reviewOn: "2999-05-05" } });
    expect((await run("propose_bet", { contactId: a.id, action: "add", prediction: "no date" })).ok).toBe(false);

    const settle = await run("propose_bet", { contactId: a.id, action: "settle", betId: bet.id, outcome: "me", note: "Landslide" });
    expect(settle.ok, settle.summary).toBe(true);
    expect(settle.proposal?.request).toEqual({ method: "POST", path: `/api/bets/${bet.id}/settle`, body: { outcome: "me", note: "Landslide" } });
    expect(settle.proposal?.changes[0]).toEqual({ label: "Outcome", from: "open", to: "I was right" });
    expect((await run("propose_bet", { contactId: a.id, action: "settle", betId: bet.id })).ok).toBe(false);
    expect((await run("propose_bet", { contactId: a.id, action: "reopen", betId: bet.id })).ok).toBe(false);

    const upd = await run("propose_bet", { contactId: a.id, action: "update", betId: bet.id, wager: "dinner", reviewOn: "2999-07-07" });
    expect(upd.proposal?.request).toEqual({ method: "PATCH", path: `/api/bets/${bet.id}`, body: { reviewOn: "2999-07-07" } });
    expect((await run("propose_bet", { contactId: a.id, action: "update", betId: bet.id, wager: "dinner" })).ok).toBe(false);

    const rm = await run("propose_bet", { contactId: a.id, action: "remove", betId: bet.id });
    expect(rm.proposal).toMatchObject({ destructive: true, request: { method: "DELETE", path: `/api/bets/${bet.id}` } });

    const other = await createContact({ firstName: "Other" });
    expect((await run("propose_bet", { contactId: other.id, action: "remove", betId: bet.id })).ok).toBe(false);
  });

  it("the MCP server exposes list_bets and a bet write tool", async () => {
    const tok = await json<{ token: string }>("/api/tokens", { method: "POST", body: { name: "mcp-bets", scope: "write" } });
    const res = await api("/mcp", {
      anonymous: true,
      method: "POST",
      headers: { authorization: `Bearer ${tok.body.token}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    const names = body.result.tools.map((t) => t.name);
    expect(names).toContain("list_bets");
    expect(names).toContain("bet");
  });
});
