import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { AskEvent, AskProposal } from "@shared/schemas/ask";
import type { FeedResult, ReminderListResult, ReminderOut } from "@shared/types";
import { nextOccurrenceAfter } from "../src/shared/recurrence";
import { getDb } from "../src/worker/db";
import { ByteBudget } from "../src/worker/services/ask/limits";
import { executeTool, type ToolCtx } from "../src/worker/services/ask/tools";
import { api, createContact, json } from "./helpers";

const todayUtc = () => new Date().toISOString().slice(0, 10);

async function createReminder(extra: Record<string, unknown> = {}): Promise<ReminderOut> {
  const { status, body } = await json<ReminderOut>("/api/reminders", { method: "POST", body: { title: "Call about the trip", dueOn: "2999-01-01", ...extra } });
  if (status !== 201) throw new Error(`createReminder failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

const eventTypes = (feed: FeedResult) => feed.items.filter((i) => i.kind === "event").map((i) => (i.kind === "event" ? i.event.eventType : ""));

describe("reminders", () => {
  it("creates, updates, completes, reopens and deletes a one-off reminder about a contact, logging activity", async () => {
    const a = await createContact({ firstName: "Remind", lastName: "Me" });
    const r = await createReminder({ contactId: a.id, notes: "Ask about Lisbon" });
    expect(r).toMatchObject({ status: "open", repeat: null, dueOn: "2999-01-01", completedAt: null, lastCompletedOn: null, completedCount: 0, notes: "Ask about Lisbon" });
    expect(r.contact?.id).toBe(a.id);

    expect((await json("/api/reminders", { method: "POST", body: { title: "", dueOn: "2999-01-01" } })).status).toBe(400);
    expect((await json("/api/reminders", { method: "POST", body: { title: "x", dueOn: "soon" } })).status).toBe(400);
    expect((await json("/api/reminders", { method: "POST", body: { title: "x", dueOn: "2999-01-01", repeat: { every: 1, unit: "fortnight" } } })).status).toBe(400);
    expect((await json("/api/reminders", { method: "POST", body: { title: "x", dueOn: "2999-01-01", repeat: { every: 1, unit: "week", until: "2998-01-01" } } })).status).toBe(400);
    expect((await json("/api/reminders", { method: "POST", body: { title: "x", dueOn: "2999-01-01", contactId: "missing" } })).status).toBe(404);

    const upd = await json<ReminderOut>(`/api/reminders/${r.id}`, { method: "PATCH", body: { title: "Call about the Lisbon trip", dueOn: "2999-02-01" } });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ title: "Call about the Lisbon trip", dueOn: "2999-02-01", status: "open" });
    const noop = await json<ReminderOut>(`/api/reminders/${r.id}`, { method: "PATCH", body: { dueOn: "2999-02-01" } });
    expect(noop.body.updatedAt).toBe(upd.body.updatedAt);

    expect((await json(`/api/reminders/${r.id}/reopen`, { method: "POST" })).status).toBe(409);
    expect((await json(`/api/reminders/${r.id}/skip`, { method: "POST" })).status).toBe(409);
    const done = await json<ReminderOut>(`/api/reminders/${r.id}/complete`, { method: "POST" });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: "done", dueOn: "2999-02-01", lastCompletedOn: "2999-02-01", completedCount: 1 });
    expect(done.body.completedAt).not.toBeNull();
    expect((await json(`/api/reminders/${r.id}/complete`, { method: "POST" })).status).toBe(409);

    const reopened = await json<ReminderOut>(`/api/reminders/${r.id}/reopen`, { method: "POST" });
    expect(reopened.body).toMatchObject({ status: "open", completedAt: null, lastCompletedOn: null, completedCount: 0, dueOn: "2999-02-01" });

    const feed = await json<FeedResult>(`/api/contacts/${a.id}/activity`);
    expect(eventTypes(feed.body)).toEqual(expect.arrayContaining(["reminder.created", "reminder.updated", "reminder.completed", "reminder.reopened"]));
    const created = feed.body.items.find((i) => i.kind === "event" && i.event.eventType === "reminder.created");
    expect(created && created.kind === "event" ? created.event.payload : null).toMatchObject({ v: 1, title: "Call about the trip", dueOn: "2999-01-01", repeat: null });
    const completed = feed.body.items.find((i) => i.kind === "event" && i.event.eventType === "reminder.completed");
    expect(completed && completed.kind === "event" ? completed.event.payload : null).toMatchObject({ v: 1, on: "2999-02-01", nextDueOn: null });

    expect((await api(`/api/reminders/${r.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await json(`/api/reminders/${r.id}`)).status).toBe(404);
    const feed2 = await json<FeedResult>(`/api/contacts/${a.id}/activity`);
    expect(eventTypes(feed2.body)).toContain("reminder.deleted");
  });

  it("recurring reminders advance to the next occurrence on complete or skip, and finish at the end date", async () => {
    // Future-dated: the next occurrence follows the due day, not today.
    const weekly = await createReminder({ title: "Water the plants", dueOn: "2999-01-01", repeat: { every: 1, unit: "week" } });
    expect(weekly.repeat).toEqual({ every: 1, unit: "week", until: null });
    const w1 = await json<ReminderOut>(`/api/reminders/${weekly.id}/complete`, { method: "POST" });
    expect(w1.body).toMatchObject({ status: "open", dueOn: "2999-01-08", lastCompletedOn: "2999-01-01", completedCount: 1 });
    const w2 = await json<ReminderOut>(`/api/reminders/${weekly.id}/skip`, { method: "POST" });
    expect(w2.body).toMatchObject({ status: "open", dueOn: "2999-01-15", lastCompletedOn: "2999-01-01", completedCount: 1 });

    // Long overdue: completing jumps past every missed occurrence to the first one after today.
    const stale = await createReminder({ title: "Call Mum", dueOn: "2000-01-03", repeat: { every: 1, unit: "week" } });
    const s1 = await json<ReminderOut>(`/api/reminders/${stale.id}/complete`, { method: "POST" });
    const today = todayUtc();
    expect(s1.body.dueOn).toBe(nextOccurrenceAfter("2000-01-03", { every: 1, unit: "week" }, today));
    expect(s1.body.dueOn > today).toBe(true);
    expect(s1.body).toMatchObject({ status: "open", lastCompletedOn: "2000-01-03", completedCount: 1 });

    // Month-end anchoring survives a short month.
    const monthly = await createReminder({ title: "Pay rent", dueOn: "2999-01-31", repeat: { every: 1, unit: "month" } });
    const m1 = await json<ReminderOut>(`/api/reminders/${monthly.id}/complete`, { method: "POST" });
    expect(m1.body.dueOn).toBe("2999-02-28");
    const m2 = await json<ReminderOut>(`/api/reminders/${monthly.id}/complete`, { method: "POST" });
    expect(m2.body.dueOn).toBe("2999-03-31");
    // Editing the due day re-anchors the schedule.
    const m3 = await json<ReminderOut>(`/api/reminders/${monthly.id}`, { method: "PATCH", body: { dueOn: "2999-05-15" } });
    expect(m3.body.dueOn).toBe("2999-05-15");
    const m4 = await json<ReminderOut>(`/api/reminders/${monthly.id}/complete`, { method: "POST" });
    expect(m4.body.dueOn).toBe("2999-06-15");
    // Turning a series into a one-off keeps the current due day.
    const m5 = await json<ReminderOut>(`/api/reminders/${monthly.id}`, { method: "PATCH", body: { repeat: null } });
    expect(m5.body).toMatchObject({ repeat: null, dueOn: "2999-06-15", completedCount: 3 });

    // A series with an end date is finished once nothing is left, and can be reopened on its last occurrence.
    const ending = await createReminder({ title: "Course session", dueOn: "2999-01-01", repeat: { every: 1, unit: "week", until: "2999-01-08" } });
    const e1 = await json<ReminderOut>(`/api/reminders/${ending.id}/complete`, { method: "POST" });
    expect(e1.body).toMatchObject({ status: "open", dueOn: "2999-01-08" });
    const e2 = await json<ReminderOut>(`/api/reminders/${ending.id}/complete`, { method: "POST" });
    expect(e2.body).toMatchObject({ status: "done", dueOn: "2999-01-08", lastCompletedOn: "2999-01-08", completedCount: 2 });
    expect(e2.body.completedAt).not.toBeNull();
    const e3 = await json<ReminderOut>(`/api/reminders/${ending.id}/reopen`, { method: "POST" });
    expect(e3.body).toMatchObject({ status: "open", dueOn: "2999-01-08", completedCount: 2 });
  });

  it("lists open-first with counts, filters by status, dueBy and contact, and follows contact changes and deletion", async () => {
    const a = await createContact({ firstName: "List", lastName: "Alpha" });
    const b = await createContact({ firstName: "List", lastName: "Beta" });
    const later = await createReminder({ title: "later", dueOn: "2999-06-01", contactId: a.id });
    const soon = await createReminder({ title: "soon", dueOn: "2999-03-01", contactId: a.id });
    const overdue = await createReminder({ title: "overdue", dueOn: "2000-02-01", contactId: a.id });
    const general = await createReminder({ title: "renew passport", dueOn: "2999-03-01" });
    expect(general.contact).toBeNull();
    const finished = await createReminder({ title: "finished", dueOn: "2999-01-01", contactId: a.id });
    await json(`/api/reminders/${finished.id}/complete`, { method: "POST" });
    const forB = await createReminder({ title: "for b", dueOn: "2999-04-01", contactId: b.id });

    const forA = await json<ReminderListResult>(`/api/contacts/${a.id}/reminders`);
    expect(forA.status).toBe(200);
    expect(forA.body.items.map((x) => x.id)).toEqual([overdue.id, soon.id, later.id, finished.id]);
    expect(forA.body.counts).toEqual({ open: 3, done: 1 });
    const openA = await json<ReminderListResult>(`/api/contacts/${a.id}/reminders?status=open`);
    expect(openA.body.items.map((x) => x.id)).toEqual([overdue.id, soon.id, later.id]);
    expect(openA.body.counts.done).toBe(1);
    const doneA = await json<ReminderListResult>(`/api/reminders?contactId=${a.id}&status=done`);
    expect(doneA.body.items.map((x) => x.id)).toEqual([finished.id]);

    const due = await json<ReminderListResult>("/api/reminders?dueBy=2999-03-01");
    const dueIds = due.body.items.map((x) => x.id);
    expect(dueIds).toContain(overdue.id);
    expect(dueIds).toContain(soon.id);
    expect(dueIds).toContain(general.id);
    expect(dueIds).not.toContain(later.id);
    expect(dueIds).not.toContain(finished.id);
    expect(dueIds.indexOf(overdue.id)).toBeLessThan(dueIds.indexOf(soon.id));
    expect((await json("/api/reminders?status=nope")).status).toBe(400);

    // Moving a reminder to another contact logs on both sides.
    const moved = await json<ReminderOut>(`/api/reminders/${forB.id}`, { method: "PATCH", body: { contactId: a.id } });
    expect(moved.body.contact?.id).toBe(a.id);
    const feedB = await json<FeedResult>(`/api/contacts/${b.id}/activity`);
    const updB = feedB.body.items.find((i) => i.kind === "event" && i.event.eventType === "reminder.updated");
    expect(updB && updB.kind === "event" ? updB.event.payload : null).toMatchObject({ changes: { contact: { from: "List Beta", to: "List Alpha" } } });
    expect(eventTypes((await json<FeedResult>(`/api/contacts/${a.id}/activity`)).body).filter((t) => t === "reminder.updated").length).toBeGreaterThan(0);
    // Detaching it from everyone works too.
    const detached = await json<ReminderOut>(`/api/reminders/${forB.id}`, { method: "PATCH", body: { contactId: null } });
    expect(detached.body.contact).toBeNull();

    // Deleting the contact takes its reminders with it; general ones stay.
    expect((await api(`/api/contacts/${a.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await json(`/api/reminders/${soon.id}`)).status).toBe(404);
    expect((await json(`/api/reminders/${general.id}`)).status).toBe(200);
    expect((await json(`/api/reminders/${forB.id}`)).status).toBe(200);
  });

  it("read-scoped tokens cannot complete a reminder", async () => {
    const r = await createReminder({ title: "token" });
    const tok = await json<{ token: string }>("/api/tokens", { method: "POST", body: { name: "ro-rem", scope: "read" } });
    expect(tok.status).toBe(201);
    const h = { authorization: `Bearer ${tok.body.token}` };
    expect((await api(`/api/reminders/${r.id}`, { anonymous: true, headers: h })).status).toBe(200);
    expect((await api(`/api/reminders/${r.id}/complete`, { anonymous: true, method: "POST", headers: h })).status).toBe(403);
  });
});

describe("ask tools: reminders", () => {
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

  it("list_reminders reads and propose_reminder drafts add / complete / skip / update / remove", async () => {
    const a = await createContact({ firstName: "Ask", lastName: "Reminder" });
    const r = await createReminder({ title: "Send the photos", dueOn: "2999-02-02", contactId: a.id, repeat: { every: 2, unit: "week" } });

    const list = await run("list_reminders", { contactId: a.id });
    expect(list.ok, list.summary).toBe(true);
    expect(list.json.items[0]).toMatchObject({ id: r.id, title: "Send the photos", dueOn: "2999-02-02", repeat: "every 2 weeks", status: "open", about: { id: a.id } });
    expect(list.json.counts).toEqual({ open: 1, done: 0 });
    const due = await run("list_reminders", { dueBy: "2000-01-01" });
    expect(due.json.items.map((x: { id: string }) => x.id)).not.toContain(r.id);

    const add = await run("propose_reminder", { action: "add", contactId: a.id, title: "Book the table", dueOn: "2999-05-05", repeat: { every: 1, unit: "year" } });
    expect(add.ok, add.summary).toBe(true);
    expect(add.proposal?.request).toMatchObject({ method: "POST", path: "/api/reminders", body: { contactId: a.id, title: "Book the table", dueOn: "2999-05-05", repeat: { every: 1, unit: "year" } } });
    expect(add.proposal?.contact?.id).toBe(a.id);
    const general = await run("propose_reminder", { action: "add", title: "Renew passport", dueOn: "2999-05-05" });
    expect(general.ok, general.summary).toBe(true);
    expect(general.proposal?.contact).toBeNull();
    expect(general.proposal?.request).toMatchObject({ method: "POST", path: "/api/reminders", body: { contactId: null, title: "Renew passport", repeat: null } });
    expect((await run("propose_reminder", { action: "add", title: "no date" })).ok).toBe(false);

    const complete = await run("propose_reminder", { action: "complete", reminderId: r.id });
    expect(complete.ok, complete.summary).toBe(true);
    expect(complete.proposal?.request).toEqual({ method: "POST", path: `/api/reminders/${r.id}/complete` });
    expect(complete.proposal?.contact?.id).toBe(a.id);
    const skip = await run("propose_reminder", { action: "skip", reminderId: r.id });
    expect(skip.proposal?.request).toEqual({ method: "POST", path: `/api/reminders/${r.id}/skip` });
    const oneOff = await createReminder({ title: "one-off" });
    expect((await run("propose_reminder", { action: "skip", reminderId: oneOff.id })).ok).toBe(false);
    expect((await run("propose_reminder", { action: "reopen", reminderId: r.id })).ok).toBe(false);

    const upd = await run("propose_reminder", { action: "update", reminderId: r.id, title: "Send the photos", dueOn: "2999-03-03", repeat: { every: 2, unit: "week" } });
    expect(upd.proposal?.request).toEqual({ method: "PATCH", path: `/api/reminders/${r.id}`, body: { dueOn: "2999-03-03" } });
    expect((await run("propose_reminder", { action: "update", reminderId: r.id, title: "Send the photos" })).ok).toBe(false);
    const once = await run("propose_reminder", { action: "update", reminderId: r.id, repeat: null });
    expect(once.proposal?.request).toEqual({ method: "PATCH", path: `/api/reminders/${r.id}`, body: { repeat: null } });
    expect(once.proposal?.changes[0]).toEqual({ label: "Repeats", from: "every 2 weeks", to: "once" });

    const rm = await run("propose_reminder", { action: "remove", reminderId: r.id });
    expect(rm.proposal).toMatchObject({ destructive: true, request: { method: "DELETE", path: `/api/reminders/${r.id}` } });
    const other = await createContact({ firstName: "Other" });
    expect((await run("propose_reminder", { action: "remove", contactId: other.id, reminderId: r.id })).ok).toBe(false);
    expect((await run("propose_reminder", { action: "remove" })).ok).toBe(false);
  });

  it("the MCP server exposes list_reminders and a reminder write tool", async () => {
    const tok = await json<{ token: string }>("/api/tokens", { method: "POST", body: { name: "mcp-reminders", scope: "write" } });
    const res = await api("/mcp", {
      anonymous: true,
      method: "POST",
      headers: { authorization: `Bearer ${tok.body.token}`, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    const names = body.result.tools.map((t) => t.name);
    expect(names).toContain("list_reminders");
    expect(names).toContain("reminder");
  });
});
