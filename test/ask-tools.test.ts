import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { AskEvent, AskProposal } from "@shared/schemas/ask";
import { getDb } from "../src/worker/db";
import { ByteBudget, MAX_TOOL_RESULT_BYTES } from "../src/worker/services/ask/limits";
import { TOOLS, executeTool, toolDefinitions, type ToolCtx } from "../src/worker/services/ask/tools";
import { createContact, createInteraction, createRelationship } from "./helpers";

const WRITE_METHODS = new Set(["insert", "update", "delete", "batch", "transaction"]);

/** A db handle that throws if any tool tries to write. */
function readOnlyDb() {
  const db = getDb(env.DB);
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (WRITE_METHODS.has(String(prop))) throw new Error(`ask tool attempted a write: ${String(prop)}`);
      return Reflect.get(target, prop, receiver);
    },
  });
}

function ctx(): ToolCtx & { events: AskEvent[] } {
  const events: AskEvent[] = [];
  return { db: readOnlyDb(), emit: (e) => void events.push(e), budget: new ByteBudget(), pending: new Map(), events };
}

async function run(name: string, input: unknown, c = ctx()) {
  const out = await executeTool({ id: `t_${name}`, name, argsJson: JSON.stringify(input) }, c);
  let json: any = null;
  if (out.ok) {
    try {
      json = JSON.parse(out.content);
    } catch {
      /* plain-text or truncated result */
    }
  }
  return { ...out, json, events: c.events };
}

describe("ask tools", () => {
  it("publishes OpenAI function definitions in a fixed order", () => {
    const defs = toolDefinitions();
    const fns = defs.map((d) => ("function" in d ? d.function : null));
    expect(fns.map((f) => f?.name)).toEqual(TOOLS.map((t) => t.name));
    expect(fns[0]?.parameters).toMatchObject({ type: "object" });
  });

  it("search_contacts finds by nickname, other name and tag", async () => {
    const a = await createContact({ firstName: "Wei", lastName: "Chen", nickname: "Weiwei", otherNames: [{ label: "Chinese name", value: "陈伟" }], tagNames: ["asktool"] });
    for (const q of ["Weiwei", "陈伟", "asktool"]) {
      const r = await run("search_contacts", { q });
      expect(r.ok, q).toBe(true);
      expect(r.json.items.map((x: { id: string }) => x.id)).toContain(a.id);
    }
    const byTag = await run("search_contacts", { tag: "asktool" });
    expect(byTag.json.items.map((x: { id: string }) => x.id)).toEqual([a.id]);
    expect(byTag.summary).toMatch(/1 of 1 item/);
  });

  it("get_contact reports relationships from the contact's perspective plus recent interactions and life events", async () => {
    const alice = await createContact({ firstName: "Alice", notes: "x".repeat(2500) });
    const rex = await createContact({ kind: "pet", firstName: "Rex" });
    await createRelationship(alice.id, rex.id, "owner");
    await createInteraction([alice.id], { summary: "Coffee", occurredAt: "2024-01-02T10:00:00.000Z" });
    await createInteraction([alice.id], { summary: "Lunch", occurredAt: "2024-03-02T10:00:00.000Z" });
    const r = await run("get_contact", { id: alice.id });
    expect(r.ok).toBe(true);
    expect(r.json.relationships).toEqual([expect.objectContaining({ otherContact: expect.objectContaining({ id: rex.id, name: "Rex" }), role: "Pet" })]);
    expect(r.json.recentInteractions.items.map((x: { summary: string }) => x.summary)).toEqual(["Lunch", "Coffee"]);
    expect(r.json.notes).toMatch(/truncated/);
    const full = await run("get_contact", { id: alice.id, notes: "full" });
    expect(full.json.notes).toHaveLength(2500);
    const missing = await run("get_contact", { id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
    expect(missing.ok).toBe(false);
    expect(missing.summary).toBe("Not found");
  });

  it("list_interactions filters by participant, text and date window", async () => {
    const a = await createContact({ firstName: "Filter A" });
    const b = await createContact({ firstName: "Filter B" });
    await createInteraction([a.id], { summary: "Talked about Portugal", occurredAt: "2024-05-01T10:00:00.000Z" });
    await createInteraction([b.id], { summary: "Talked about Spain", body: "and portugal too", occurredAt: "2024-06-01T10:00:00.000Z" });
    const byText = await run("list_interactions", { q: "portugal" });
    expect(byText.json.total).toBe(2);
    const byContact = await run("list_interactions", { q: "portugal", contactId: b.id });
    expect(byContact.json.items.map((x: { summary: string }) => x.summary)).toEqual(["Talked about Spain"]);
    const byDate = await run("list_interactions", { q: "portugal", since: "2024-05-15T00:00:00.000Z" });
    expect(byDate.json.total).toBe(1);
    const untilDate = await run("list_interactions", { q: "portugal", until: "2024-05-15T00:00:00.000Z" });
    expect(untilDate.json.items[0].summary).toBe("Talked about Portugal");
  });

  it("propose_interaction validates ids and emits exactly one proposal", async () => {
    const a = await createContact({ firstName: "Propose" });
    const bad = await run("propose_interaction", { contactIds: [a.id, "01ARZ3NDEKTSV4RRFFQ69G5FAV"], type: "call", occurredAt: "2024-01-01T00:00:00.000Z", summary: "x" });
    expect(bad.ok).toBe(false);
    expect(bad.summary).toMatch(/Unknown contact/);
    const now = await run("propose_interaction", { contactIds: [a.id], type: "call", summary: "Just now" });
    expect(now.ok, now.summary).toBe(true);
    const nowProposal = now.events.find((e) => e.type === "proposal");
    const occurred = nowProposal && nowProposal.type === "proposal" && nowProposal.proposal.kind === "interaction" ? Date.parse(nowProposal.proposal.input.occurredAt) : NaN;
    expect(Math.abs(Date.now() - occurred)).toBeLessThan(60_000);

    const good = await run("propose_interaction", { contactIds: [a.id], type: "call", occurredAt: "2024-01-01T00:00:00.000Z", summary: "Caught up", body: "Notes" });
    expect(good.ok).toBe(true);
    expect(good.content).toMatch(/Apply/);
    const proposals = good.events.filter((e) => e.type === "proposal");
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ proposal: { kind: "interaction", input: { summary: "Caught up", contactIds: [a.id] }, participants: [{ id: a.id }] } });
  });

  it("propose_contact_update diffs birthday, job title and employer against the current values", async () => {
    const org = await createContact({ kind: "organization", firstName: "Acme Ltd" });
    const other = await createContact({ firstName: "Not An Org" });
    const p = await createContact({ firstName: "Sam", lastName: "Hill", jobTitle: "Analyst", birthday: "1990-05" });

    const good = await run("propose_contact_update", { contactId: p.id, birthday: "1990-05-14", jobTitle: "Senior Manager", employerContactId: org.id });
    expect(good.ok, good.summary).toBe(true);
    const proposals = good.events.filter((e) => e.type === "proposal");
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      proposal: {
        kind: "action",
        contact: { id: p.id },
        request: { method: "PATCH", path: `/api/contacts/${p.id}`, body: { birthday: "1990-05-14", jobTitle: "Senior Manager", employerContactId: org.id } },
        changes: [
          { label: "Birthday", from: "1990-05", to: "1990-05-14" },
          { label: "Job title", from: "Analyst", to: "Senior Manager" },
          { label: "Employer", from: null, to: "Acme Ltd" },
        ],
      },
    });
    const names = await run("propose_contact_update", { contactId: p.id, pronouns: "he/him", nickname: "", otherNames: [{ label: "Maiden name", value: "Smith" }], metViaContactId: other.id });
    expect(names.ok, names.summary).toBe(true);
    const np = names.events.find((e) => e.type === "proposal");
    expect(np).toMatchObject({ proposal: { kind: "action", request: { body: { pronouns: "he/him", otherNames: [{ label: "Maiden name", value: "Smith" }], metViaContactId: other.id } } } });
    expect((np as { proposal: { request: { body: Record<string, unknown> } } }).proposal.request.body).not.toHaveProperty("nickname");

    const unchanged = await run("propose_contact_update", { contactId: p.id, jobTitle: "Analyst" });
    expect(unchanged.ok).toBe(false);
    expect(unchanged.summary).toMatch(/Nothing would change/);
    const notOrg = await run("propose_contact_update", { contactId: p.id, employerContactId: other.id });
    expect(notOrg.ok).toBe(false);
    expect(notOrg.summary).toMatch(/organisation/);
    const missingOrg = await run("propose_contact_update", { contactId: p.id, employerContactId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
    expect(missingOrg.ok).toBe(false);
    expect(missingOrg.summary).toMatch(/does not exist/);
    const badDate = await run("propose_contact_update", { contactId: p.id, birthday: "14/05/1990" });
    expect(badDate.ok).toBe(false);
    const orgTitle = await run("propose_contact_update", { contactId: org.id, jobTitle: "x" });
    expect(orgTitle.summary).toMatch(/Only people/);
  });

  it("proposes tags, contact methods, relationships, life events, edits and deletions as actions with the right requests", async () => {
    const a = await createContact({ firstName: "Action", lastName: "Person", tagNames: ["old"], methods: [{ type: "email", value: "a@example.com" }] });
    const rex = await createContact({ kind: "pet", firstName: "Rexy" });
    const x = await createInteraction([a.id], { summary: "Lunch", occurredAt: "2024-03-02T10:00:00.000Z" });
    const pick = (r: Awaited<ReturnType<typeof run>>) => {
      expect(r.ok, r.summary).toBe(true);
      const e = r.events.find((ev) => ev.type === "proposal");
      return (e as { proposal: Extract<AskProposal, { kind: "action" }> }).proposal;
    };

    const tags = pick(await run("propose_tags", { contactId: a.id, add: ["new", "Old"], remove: ["missing"] }));
    expect(tags.request).toEqual({ method: "PUT", path: `/api/contacts/${a.id}/tags`, body: { tagNames: ["old", "new"] } });
    expect((await run("propose_tags", { contactId: a.id, add: ["old"] })).ok).toBe(false);

    const addPhone = pick(await run("propose_contact_method", { contactId: a.id, action: "add", type: "phone", label: "mobile", value: "+44 7000 000000" }));
    expect(addPhone.request).toMatchObject({ method: "POST", path: `/api/contacts/${a.id}/methods`, body: { type: "phone", label: "mobile", value: "+44 7000 000000" } });
    const detail = await run("get_contact", { id: a.id });
    const emailId = detail.json.methods[0].id as string;
    const rmEmail = pick(await run("propose_contact_method", { contactId: a.id, action: "remove", methodId: emailId }));
    expect(rmEmail).toMatchObject({ destructive: true, request: { method: "DELETE", path: `/api/contacts/${a.id}/methods/${emailId}` } });

    const rel = pick(await run("propose_relationship", { action: "add", fromContactId: a.id, toContactId: rex.id, typeKey: "owner" }));
    expect(rel.request).toMatchObject({ method: "POST", path: "/api/relationships", body: { fromContactId: a.id, toContactId: rex.id, typeKey: "owner" } });
    expect(rel.changes[0]!.to).toMatch(/Action Person is the owner of Rexy/);
    const badType = await run("propose_relationship", { action: "add", fromContactId: a.id, toContactId: rex.id, typeKey: "nope" });
    expect(badType.summary).toMatch(/Available:/);

    const le = pick(await run("propose_life_event", { contactId: a.id, action: "add", category: "home_living", title: "Moved to Leeds", occurredOn: "2025-06" }));
    expect(le.request).toMatchObject({ method: "POST", path: `/api/contacts/${a.id}/life-events`, body: { category: "home_living", title: "Moved to Leeds", occurredOn: "2025-06" } });

    const upd = pick(await run("propose_interaction_update", { interactionId: x.id, summary: "Lunch at Nandos", location: "Nandos", contactIds: [a.id] }));
    expect(upd.request).toEqual({ method: "PATCH", path: `/api/interactions/${x.id}`, body: { summary: "Lunch at Nandos", location: "Nandos" } });
    const del = pick(await run("propose_interaction_delete", { interactionId: x.id }));
    expect(del).toMatchObject({ destructive: true, request: { method: "DELETE", path: `/api/interactions/${x.id}` } });

    const created = pick(await run("propose_contact_create", { kind: "organization", firstName: "Acme Ltd", tagNames: ["client"], methods: [{ type: "url", value: "https://acme.example" }] }));
    expect(created.request).toMatchObject({ method: "POST", path: "/api/contacts", body: { kind: "organization", firstName: "Acme Ltd", tagNames: ["client"] } });
    expect(created.contact).toBeNull();

    const arch = pick(await run("propose_archive", { contactId: a.id, archived: true }));
    expect(arch.request).toEqual({ method: "POST", path: `/api/contacts/${a.id}/archive` });
    expect((await run("propose_archive", { contactId: a.id, archived: false })).ok).toBe(false);

    const dead = pick(await run("propose_deceased", { contactId: rex.id, deceased: true, on: "2025-01" }));
    expect(dead).toMatchObject({ destructive: true, request: { method: "POST", path: `/api/contacts/${rex.id}/deceased`, body: { on: "2025-01" } } });
    expect((await run("propose_deceased", { contactId: rex.id, deceased: false })).ok).toBe(false);
    const orgDead = await run("propose_deceased", { contactId: (await createContact({ kind: "organization", firstName: "No Death Ltd" })).id, deceased: true });
    expect(orgDead.summary).toMatch(/Only people and pets/);
  });

  it("chains proposals on a not-yet-created contact via new:<id> placeholders", async () => {
    const sam = await createContact({ firstName: "Chain", lastName: "Sam" });
    const c = ctx();
    const created = await run("propose_contact_create", { kind: "organization", firstName: "Acme UK" }, c);
    expect(created.ok, created.summary).toBe(true);
    const createEvt = c.events.find((e) => e.type === "proposal") as { proposal: { id: string } };
    const placeholder = `new:${createEvt.proposal.id}`;
    expect(created.content).toContain(placeholder);

    const job = await run("propose_contact_update", { contactId: sam.id, jobTitle: "Senior Manager", employerContactId: placeholder }, c);
    expect(job.ok, job.summary).toBe(true);
    const jobEvt = c.events.filter((e) => e.type === "proposal").at(-1) as { proposal: Extract<AskProposal, { kind: "action" }> };
    expect(jobEvt.proposal.dependsOn).toEqual([createEvt.proposal.id]);
    expect(jobEvt.proposal.request.body).toMatchObject({ jobTitle: "Senior Manager", employerContactId: placeholder });
    expect(jobEvt.proposal.changes).toContainEqual({ label: "Employer", from: null, to: "Acme UK" });

    const meet = await run("propose_interaction", { contactIds: [sam.id, placeholder], type: "meeting", summary: "Intro at Acme Ltd" }, c);
    expect(meet.ok, meet.summary).toBe(true);
    const meetEvt = c.events.filter((e) => e.type === "proposal").at(-1) as { proposal: Extract<AskProposal, { kind: "interaction" }> };
    expect(meetEvt.proposal.dependsOn).toEqual([createEvt.proposal.id]);
    expect(meetEvt.proposal.participants.map((p) => p.displayName)).toEqual(["Chain Sam", "Acme UK"]);

    const person = await run("propose_contact_create", { kind: "person", firstName: "Pet Owner" }, c);
    expect(person.ok).toBe(true);
    const notOrg = await run("propose_contact_update", { contactId: sam.id, employerContactId: `new:${(c.events.filter((e) => e.type === "proposal").at(-1) as { proposal: { id: string } }).proposal.id}` }, c);
    expect(notOrg.ok).toBe(false);
    expect(notOrg.summary).toMatch(/organisation/);
    const unknown = await run("propose_contact_update", { contactId: sam.id, employerContactId: "new:01ARZ3NDEKTSV4RRFFQ69G5FAV" }, ctx());
    expect(unknown.summary).toMatch(/placeholder/);
  });

  it("rejects bad arguments without throwing and enforces the byte budget", async () => {
    const badJson = await executeTool({ id: "x", name: "search_contacts", argsJson: "{not json" }, ctx());
    expect(badJson.ok).toBe(false);
    expect(badJson.summary).toMatch(/valid JSON/);
    const badShape = await run("search_contacts", { limit: 999 });
    expect(badShape.ok).toBe(false);
    expect(badShape.summary).toMatch(/limit/);
    const unknown = await run("nope", {});
    expect(unknown.summary).toMatch(/Unknown tool/);

    const a = await createContact({ firstName: "Big", notes: "y".repeat(30_000) });
    const big = await run("get_contact", { id: a.id, notes: "full" });
    expect(big.ok).toBe(true);
    expect(big.content.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_BYTES + 120);
    expect(big.content).toMatch(/result truncated/);

    const tight = ctx();
    tight.budget.spend(10 ** 9);
    const refused = await run("search_contacts", { q: "Big" }, tight);
    expect(refused.ok).toBe(false);
    expect(refused.summary).toMatch(/budget exhausted/);
  });
});
