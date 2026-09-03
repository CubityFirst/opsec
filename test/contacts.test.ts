import { describe, expect, it } from "vitest";
import type { ApiErrorBody, ContactDetail, ContactMethodOut, ContactSummary, FeedResult, ListResult, RelationshipOut, SearchResult, TagWithCount } from "@shared/types";
import { api, apiAs, createContact, createInteraction, createRelationship, json } from "./helpers";

describe("health", () => {
  it("responds", async () => {
    const { status, body } = await json("/api/health");
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const { status, body } = await json<ApiErrorBody>("/api/nope");
    expect(status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });
});

describe("contacts", () => {
  it("creates a contact with methods and tags and records contact.created", async () => {
    const created = await createContact({
      firstName: "Ada",
      lastName: "Lovelace",
      nickname: "Countess",
      birthday: "1815-12-10",
      methods: [
        { type: "email", label: "home", value: "ada@example.com", isPrimary: true },
        { type: "phone", label: "mobile", value: "+44 7700 900001", isPrimary: true },
      ],
      tagNames: ["Mathematician", "friend"],
    });
    expect(created.displayName).toBe("Ada Lovelace");
    expect(created.primaryEmail).toBe("ada@example.com");
    expect(created.primaryPhone).toBe("+44 7700 900001");
    expect(created.tags.map((t) => t.name).sort()).toEqual(["Mathematician", "friend"]);
    expect(created.methods).toHaveLength(2);
    expect(created.avatarUrl).toBeNull();
    expect(created.lastInteraction).toBeNull();

    const feed = await json<FeedResult>(`/api/contacts/${created.id}/activity`);
    expect(feed.status).toBe(200);
    const types = feed.body.items.map((i) => (i.kind === "event" ? i.event.eventType : "interaction"));
    expect(types).toContain("contact.created");
  });

  it("stores other names, shows them in the summary and finds contacts by them", async () => {
    const c = await createContact({ firstName: "Wei", lastName: "Chen", otherNames: [{ label: "Chinese name", value: "陈伟" }, { label: "English name", value: "William" }] });
    expect(c.otherNames).toEqual([{ label: "Chinese name", value: "陈伟" }, { label: "English name", value: "William" }]);
    const byChinese = await json<ListResult<ContactSummary>>("/api/contacts?q=%E9%99%88%E4%BC%9F");
    expect(byChinese.body.items.map((x) => x.id)).toEqual([c.id]);
    const hit = await json<SearchResult>("/api/search?q=William");
    expect(hit.body.contacts[0]?.id).toBe(c.id);
    const upd = await json<ContactDetail>(`/api/contacts/${c.id}`, { method: "PATCH", body: { otherNames: [{ label: "Chinese name", value: "陈伟" }] } });
    expect(upd.body.otherNames).toHaveLength(1);
    const bad = await json<ApiErrorBody>(`/api/contacts/${c.id}`, { method: "PATCH", body: { otherNames: [{ label: "", value: "x" }] } });
    expect(bad.status).toBe(400);
  });

  it("records how we met, including who introduced us", async () => {
    const alice = await createContact({ firstName: "Alice" });
    const bob = await createContact({ firstName: "Bob", metOn: "2019-05", metWhere: "Climbing gym", metHow: "Belay partners", metViaContactId: alice.id });
    expect(bob.metOn).toBe("2019-05");
    expect(bob.metWhere).toBe("Climbing gym");
    expect(bob.metVia?.id).toBe(alice.id);
    const self = await json<ApiErrorBody>(`/api/contacts/${bob.id}`, { method: "PATCH", body: { metViaContactId: bob.id } });
    expect(self.status).toBe(400);
    const missing = await json<ApiErrorBody>(`/api/contacts/${bob.id}`, { method: "PATCH", body: { metViaContactId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" } });
    expect(missing.status).toBe(400);
    const cleared = await json<ContactDetail>(`/api/contacts/${bob.id}`, { method: "PATCH", body: { metViaContactId: null, metOn: null } });
    expect(cleared.body.metVia).toBeNull();
    expect(cleared.body.metOn).toBeNull();
    // Deleting the introducer clears the link rather than breaking the contact.
    const carol = await createContact({ firstName: "Carol" });
    const dave = await createContact({ firstName: "Dave", metViaContactId: carol.id });
    await api(`/api/contacts/${carol.id}`, { method: "DELETE" });
    expect((await json<ContactDetail>(`/api/contacts/${dave.id}`)).body.metVia).toBeNull();
  });

  it("job title and place of work maintain the employer relationship", async () => {
    const acme = await createContact({ kind: "organization", firstName: "Acme Ltd" });
    const globex = await createContact({ kind: "organization", firstName: "Globex" });
    const person = await createContact({ firstName: "Sam", lastName: "Hill" });
    const notOrg = await json<ApiErrorBody>(`/api/contacts/${person.id}`, { method: "PATCH", body: { employerContactId: person.id } });
    expect(notOrg.status).toBe(400);

    const set = await json<ContactDetail>(`/api/contacts/${person.id}`, { method: "PATCH", body: { jobTitle: "Auditor", employerContactId: acme.id } });
    expect(set.body.jobTitle).toBe("Auditor");
    expect(set.body.employer?.id).toBe(acme.id);
    let rels = await json<ListResult<RelationshipOut>>(`/api/contacts/${person.id}/relationships`);
    expect(rels.body.items.map((r) => [r.otherContact.id, r.typeKey])).toEqual([[acme.id, "employer"]]);
    let acmeRels = await json<ListResult<RelationshipOut>>(`/api/contacts/${acme.id}/relationships`);
    expect(acmeRels.body.items[0]).toMatchObject({ typeKey: "employee" });

    // Changing employer swaps the relationship; setting it again is idempotent.
    await json(`/api/contacts/${person.id}`, { method: "PATCH", body: { employerContactId: globex.id } });
    await json(`/api/contacts/${person.id}`, { method: "PATCH", body: { employerContactId: globex.id } });
    rels = await json<ListResult<RelationshipOut>>(`/api/contacts/${person.id}/relationships`);
    expect(rels.body.items.map((r) => r.otherContact.id)).toEqual([globex.id]);

    // Deleting the relationship by hand clears the field.
    await api(`/api/relationships/${(await json<{ items: { id: string }[] }>(`/api/contacts/${person.id}/relationships`)).body.items[0]!.id}`, { method: "DELETE" });
    expect((await json<ContactDetail>(`/api/contacts/${person.id}`)).body.employer).toBeNull();

    // Clearing the field removes the relationship.
    await json(`/api/contacts/${person.id}`, { method: "PATCH", body: { employerContactId: acme.id } });
    await json(`/api/contacts/${person.id}`, { method: "PATCH", body: { employerContactId: null } });
    rels = await json<ListResult<RelationshipOut>>(`/api/contacts/${person.id}/relationships`);
    expect(rels.body.items).toHaveLength(0);
  });

  it("computes display names per kind", async () => {
    const pet = await createContact({ kind: "pet", firstName: "Rex", lastName: "Ignored" });
    expect(pet.displayName).toBe("Rex");
    const org = await createContact({ kind: "organization", firstName: "Acme Ltd" });
    expect(org.displayName).toBe("Acme Ltd");
  });

  it("accepts partial birthdays and rejects impossible dates", async () => {
    const ok = ["--02-29", "1815-12-10", "2006", "2003-05", "--05"];
    for (const birthday of ok) {
      const c = await createContact({ kind: "pet", firstName: `B ${birthday}`, birthday });
      expect(c.birthday, birthday).toBe(birthday);
    }
    for (const bad of ["1990-13-01", "--04-31", "1990-2-3", "12/10/1815", "2003-13", "--00", "--05-", "-", "1990--12"]) {
      const { status, body } = await json<ApiErrorBody>("/api/contacts", { method: "POST", body: { kind: "person", firstName: "X", birthday: bad } });
      expect(status, bad).toBe(400);
      expect(body.error.code).toBe("validation_error");
    }
    const c = await createContact({ firstName: "Clear", birthday: "2006" });
    const cleared = await json<ContactDetail>(`/api/contacts/${c.id}`, { method: "PATCH", body: { birthday: null } });
    expect(cleared.body.birthday).toBeNull();
  });

  it("rejects an invalid kind with a validation_error envelope", async () => {
    const { status, body } = await json<ApiErrorBody>("/api/contacts", { method: "POST", body: { kind: "alien", firstName: "Zed" } });
    expect(status).toBe(400);
    expect(body.error.code).toBe("validation_error");
    expect(Array.isArray(body.error.issues)).toBe(true);
  });

  it("patches fields, recomputes display name and logs a diff", async () => {
    const c = await createContact({ firstName: "Grace", lastName: "Hopper" });
    const { status, body } = await json<ContactDetail>(`/api/contacts/${c.id}`, { method: "PATCH", body: { lastName: "Murray Hopper", notes: "Navy" } });
    expect(status).toBe(200);
    expect(body.displayName).toBe("Grace Murray Hopper");
    expect(body.notes).toBe("Navy");

    const feed = await json<FeedResult>(`/api/contacts/${c.id}/activity`);
    const updated = feed.body.items.find((i) => i.kind === "event" && i.event.eventType === "contact.updated");
    expect(updated).toBeDefined();
    const changes = (updated!.kind === "event" ? updated!.event.payload : {}) as { changes: Record<string, { from: unknown; to: unknown }> };
    expect(changes.changes.lastName).toEqual({ from: "Hopper", to: "Murray Hopper" });
    expect(changes.changes.notes).toEqual({ from: null, to: "Navy" });
  });

  it("archives and unarchives, hiding from the default list", async () => {
    const c = await createContact({ firstName: "Archie" });
    let list = await json<ListResult<ContactSummary>>("/api/contacts");
    expect(list.body.items.some((x) => x.id === c.id)).toBe(true);

    const archived = await json<ContactDetail>(`/api/contacts/${c.id}/archive`, { method: "POST" });
    expect(archived.body.archivedAt).not.toBeNull();
    list = await json<ListResult<ContactSummary>>("/api/contacts");
    expect(list.body.items.some((x) => x.id === c.id)).toBe(false);
    list = await json<ListResult<ContactSummary>>("/api/contacts?archived=true");
    expect(list.body.items.some((x) => x.id === c.id)).toBe(true);

    const restored = await json<ContactDetail>(`/api/contacts/${c.id}/unarchive`, { method: "POST" });
    expect(restored.body.archivedAt).toBeNull();
  });

  it("hard deletes a contact and its orphaned interactions", async () => {
    const a = await createContact({ firstName: "Solo" });
    const b = await createContact({ firstName: "Buddy" });
    const solo = await createInteraction([a.id], { summary: "only solo" });
    const shared = await createInteraction([a.id, b.id], { summary: "shared" });

    const del = await api(`/api/contacts/${a.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    expect((await json(`/api/contacts/${a.id}`)).status).toBe(404);
    expect((await json(`/api/interactions/${solo.id}`)).status).toBe(404);
    const kept = await json<{ participants: unknown[] }>(`/api/interactions/${shared.id}`);
    expect(kept.status).toBe(200);
    expect(kept.body.participants).toHaveLength(1);
  });

  it("replaces tags via PUT and logs add/remove events", async () => {
    const c = await createContact({ firstName: "Tagged", tagNames: ["alpha", "beta"] });
    const { body } = await json<ContactDetail>(`/api/contacts/${c.id}/tags`, { method: "PUT", body: { tagNames: ["beta", "Gamma"] } });
    expect(body.tags.map((t) => t.name).sort()).toEqual(["Gamma", "beta"]);
    const feed = await json<FeedResult>(`/api/contacts/${c.id}/activity`);
    const events = feed.body.items.filter((i) => i.kind === "event").map((i) => (i.kind === "event" ? i.event : null)!);
    expect(events.some((e) => e.eventType === "tag.added" && (e.payload as { name: string }).name === "Gamma")).toBe(true);
    expect(events.some((e) => e.eventType === "tag.removed" && (e.payload as { name: string }).name === "alpha")).toBe(true);

    const tags = await json<ListResult<TagWithCount>>("/api/tags");
    expect(tags.body.items.find((t) => t.name === "beta")?.contactCount).toBe(1);
    expect(tags.body.items.find((t) => t.name === "alpha")?.contactCount).toBe(0);
  });

  it("dedupes tags case-insensitively", async () => {
    const a = await createContact({ firstName: "One", tagNames: ["Friend"] });
    const b = await createContact({ firstName: "Two", tagNames: ["friend"] });
    expect(a.tags[0].id).toBe(b.tags[0].id);
  });
});

describe("bulk actions", () => {
  it("adds and removes tags, archives and unarchives many contacts, logging each", async () => {
    const a = await createContact({ firstName: "Bulk A", tagNames: ["keep"] });
    const b = await createContact({ firstName: "Bulk B", tagNames: ["bulk-x"] });
    const ids = [a.id, b.id];

    const add = await json<{ updated: number }>("/api/contacts/bulk", { method: "POST", body: { ids, action: "addTags", tagNames: ["bulk-x", "Bulk-Y"] } });
    expect(add.status).toBe(200);
    expect(add.body.updated).toBe(2);
    let detailA = await json<ContactDetail>(`/api/contacts/${a.id}`);
    expect(detailA.body.tags.map((t) => t.name).sort()).toEqual(["Bulk-Y", "bulk-x", "keep"]);
    let detailB = await json<ContactDetail>(`/api/contacts/${b.id}`);
    expect(detailB.body.tags.map((t) => t.name).sort()).toEqual(["Bulk-Y", "bulk-x"]);

    const remove = await json<{ updated: number }>("/api/contacts/bulk", { method: "POST", body: { ids, action: "removeTags", tagNames: ["bulk-x", "nonexistent"] } });
    expect(remove.body.updated).toBe(2);
    detailA = await json<ContactDetail>(`/api/contacts/${a.id}`);
    expect(detailA.body.tags.map((t) => t.name).sort()).toEqual(["Bulk-Y", "keep"]);
    const feed = await json<FeedResult>(`/api/contacts/${b.id}/activity`);
    const tagEvents = feed.body.items.filter((i) => i.kind === "event" && i.event.eventType.startsWith("tag."));
    expect(tagEvents.length).toBeGreaterThanOrEqual(2);

    const archive = await json<{ updated: number }>("/api/contacts/bulk", { method: "POST", body: { ids, action: "archive" } });
    expect(archive.body.updated).toBe(2);
    detailB = await json<ContactDetail>(`/api/contacts/${b.id}`);
    expect(detailB.body.archivedAt).not.toBeNull();
    // Archiving again is a no-op.
    expect((await json<{ updated: number }>("/api/contacts/bulk", { method: "POST", body: { ids, action: "archive" } })).body.updated).toBe(0);
    const unarchive = await json<{ updated: number }>("/api/contacts/bulk", { method: "POST", body: { ids, action: "unarchive" } });
    expect(unarchive.body.updated).toBe(2);

    const bad = await json<ApiErrorBody>("/api/contacts/bulk", { method: "POST", body: { ids, action: "addTags", tagNames: [] } });
    expect(bad.status).toBe(400);
  });

  it("bulk delete is admin-only and cascades", async () => {
    const a = await createContact({ firstName: "Del A" });
    const b = await createContact({ firstName: "Del B" });
    await createInteraction([a.id], { summary: "solo" });
    const denied = await apiAs({ sub: "m", email: "allowed@example.com", emailVerified: true }, "/api/contacts/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [a.id, b.id], action: "delete" }),
    });
    expect(denied.status).toBe(403);
    const ok = await json<{ updated: number }>("/api/contacts/bulk", { method: "POST", body: { ids: [a.id, b.id, "missing"], action: "delete" } });
    expect(ok.body.updated).toBe(2);
    expect((await json(`/api/contacts/${a.id}`)).status).toBe(404);
    expect((await json(`/api/contacts/${b.id}`)).status).toBe(404);
  });
});

describe("social methods", () => {
  it("normalises pasted URLs and handles to a platform key + canonical URL", async () => {
    const c = await createContact({
      firstName: "Social",
      methods: [
        { type: "social", value: "https://twitter.com/jack?s=21" },
        { type: "social", label: "youtube", value: "@veritasium" },
        { type: "social", label: "linkedin", value: "https://www.linkedin.com/in/someone-123/" },
        { type: "social", value: "https://hachyderm.io/@alice" },
        { type: "social", label: "discord", value: "alice#1234" },
        { type: "social", value: "https://example.org/whatever" },
      ],
    });
    const byValue = Object.fromEntries(c.methods.map((m) => [m.label, m.value]));
    expect(byValue.x).toBe("https://x.com/jack");
    expect(byValue.youtube).toBe("https://www.youtube.com/@veritasium");
    expect(byValue.linkedin).toBe("https://www.linkedin.com/in/someone-123");
    expect(byValue.mastodon).toBe("https://hachyderm.io/@alice");
    expect(byValue.discord).toBe("alice#1234");
    expect(byValue.website).toBe("https://example.org/whatever");

    const added = await json<ContactMethodOut>(`/api/contacts/${c.id}/methods`, { method: "POST", body: { type: "social", value: "instagram.com/natgeo/" } });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ label: "instagram", value: "https://www.instagram.com/natgeo" });

    const changed = await json<ContactMethodOut>(`/api/contacts/${c.id}/methods/${added.body.id}`, { method: "PATCH", body: { value: "https://www.tiktok.com/@natgeo" } });
    expect(changed.body).toMatchObject({ label: "tiktok", value: "https://www.tiktok.com/@natgeo" });
  });
});

describe("contact methods", () => {
  it("adds, makes primary, updates and removes methods", async () => {
    const c = await createContact({ firstName: "Methodical", methods: [{ type: "phone", label: "home", value: "111", isPrimary: true }] });
    const add = await json<ContactMethodOut>(`/api/contacts/${c.id}/methods`, {
      method: "POST",
      body: { type: "phone", label: "mobile", value: "222", isPrimary: true },
    });
    expect(add.status).toBe(201);
    let detail = await json<ContactDetail>(`/api/contacts/${c.id}`);
    expect(detail.body.primaryPhone).toBe("222");
    expect(detail.body.methods.filter((m) => m.isPrimary)).toHaveLength(1);

    const upd = await json<ContactMethodOut>(`/api/contacts/${c.id}/methods/${add.body.id}`, { method: "PATCH", body: { value: "333" } });
    expect(upd.body.value).toBe("333");

    const del = await api(`/api/contacts/${c.id}/methods/${add.body.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    detail = await json<ContactDetail>(`/api/contacts/${c.id}`);
    expect(detail.body.methods).toHaveLength(1);
    expect(detail.body.primaryPhone).toBe("111");
  });
});

describe("list and search", () => {
  it("stores pronouns and clears them with null", async () => {
    const a = await createContact({ firstName: "Sam", pronouns: "they/them" });
    expect(a.pronouns).toBe("they/them");
    const patched = await json<{ pronouns: string | null }>(`/api/contacts/${a.id}`, { method: "PATCH", body: { pronouns: null } });
    expect(patched.status).toBe(200);
    expect(patched.body.pronouns).toBeNull();
  });

  it("marks a person or pet as deceased: hidden from the default list, relationships kept, reversible", async () => {
    const owner = await createContact({ firstName: "Grieving", lastName: "Owner" });
    const rex = await createContact({ kind: "pet", firstName: "Old Rex" });
    const org = await createContact({ kind: "organization", firstName: "Acme Deceased Ltd" });
    await createRelationship(owner.id, rex.id, "owner");

    expect((await json(`/api/contacts/${org.id}/deceased`, { method: "POST", body: { on: "2024" } })).status).toBe(400);
    expect((await json(`/api/contacts/${rex.id}/deceased`, { method: "POST", body: { on: "not-a-date" } })).status).toBe(400);

    const marked = await json<ContactDetail>(`/api/contacts/${rex.id}/deceased`, { method: "POST", body: { on: "2024-05" } });
    expect(marked.status).toBe(200);
    expect(marked.body.deceasedOn).toBe("2024-05");
    expect(marked.body.deceasedAt).not.toBeNull();

    const active = await json<{ items: { id: string }[] }>("/api/contacts?q=Old%20Rex");
    expect(active.body.items.map((c) => c.id)).not.toContain(rex.id);
    const dead = await json<{ items: { id: string }[] }>("/api/contacts?q=Old%20Rex&deceased=true");
    expect(dead.body.items.map((c) => c.id)).toEqual([rex.id]);

    // Relationships survive and carry the marker from the other side.
    const rels = await json<{ items: { otherContact: { id: string; deceased: boolean } }[] }>(`/api/contacts/${owner.id}/relationships`);
    expect(rels.body.items.find((r) => r.otherContact.id === rex.id)?.otherContact.deceased).toBe(true);

    // Marking again only changes the date; logged as an update rather than a second "deceased" event.
    const redated = await json<ContactDetail>(`/api/contacts/${rex.id}/deceased`, { method: "POST", body: { on: "2024-05-12" } });
    expect(redated.body.deceasedOn).toBe("2024-05-12");
    expect(redated.body.deceasedAt).toBe(marked.body.deceasedAt);

    const cleared = await json<ContactDetail>(`/api/contacts/${rex.id}/deceased`, { method: "DELETE" });
    expect(cleared.body.deceasedAt).toBeNull();
    expect(cleared.body.deceasedOn).toBeNull();
    const feed = await json<{ items: { kind: string; event?: { eventType: string } }[] }>(`/api/contacts/${rex.id}/activity`);
    const types = feed.body.items.map((i) => i.event?.eventType);
    expect(types.filter((t) => t === "contact.deceased")).toHaveLength(1);
    expect(types).toContain("contact.undeceased");
  });

  it("stores a pet's animal type and clears it with null", async () => {
    const rex = await createContact({ kind: "pet", firstName: "Rex", animalType: "Cockapoo" });
    expect(rex.animalType).toBe("Cockapoo");
    const patched = await json<{ animalType: string | null }>(`/api/contacts/${rex.id}`, { method: "PATCH", body: { animalType: null } });
    expect(patched.status).toBe(200);
    expect(patched.body.animalType).toBeNull();
  });

  it("filters by q across name, nickname, methods and tags", async () => {
    const a = await createContact({ firstName: "Zelda", nickname: "Zee", methods: [{ type: "phone", value: "+44 7000 123456" }], tagNames: ["hyrule"] });
    await createContact({ firstName: "Link" });

    for (const q of ["zel", "Zee", "123456", "hyrule"]) {
      const list = await json<ListResult<ContactSummary>>(`/api/contacts?q=${encodeURIComponent(q)}`);
      expect(list.body.items.map((x) => x.id), `q=${q}`).toEqual([a.id]);
    }
    const byKind = await json<ListResult<ContactSummary>>("/api/contacts?kind=pet&limit=200");
    expect(byKind.body.items.every((x) => x.kind === "pet")).toBe(true);
    expect(byKind.body.items.some((x) => x.id === a.id)).toBe(false);
    const byTag = await json<ListResult<ContactSummary>>("/api/contacts?tag=HYRULE");
    expect(byTag.body.items.map((x) => x.id)).toEqual([a.id]);
  });

  it("finds names containing underscores and percent signs", async () => {
    const a = await createContact({ firstName: "__probe_100%" });
    const list = await json<ListResult<ContactSummary>>("/api/contacts?q=__probe_100%25");
    expect(list.body.items.map((x) => x.id)).toEqual([a.id]);
    const hit = await json<SearchResult>("/api/search?q=__probe");
    expect(hit.body.contacts[0]?.id).toBe(a.id);
  });

  it("search endpoint reports what matched", async () => {
    const a = await createContact({ firstName: "Marie", lastName: "Curie", methods: [{ type: "email", value: "marie@radium.example" }] });
    const byName = await json<SearchResult>("/api/search?q=curie");
    expect(byName.body.contacts[0]).toMatchObject({ id: a.id, matchedOn: "name" });
    const byMethod = await json<SearchResult>("/api/search?q=radium");
    expect(byMethod.body.contacts[0]).toMatchObject({ id: a.id, matchedOn: "method" });
  });

  it("sorts by last contacted", async () => {
    const recent = await createContact({ firstName: "Recent" });
    const stale = await createContact({ firstName: "Stale" });
    const never = await createContact({ firstName: "Never" });
    await createInteraction([stale.id], { occurredAt: "2020-01-01T00:00:00.000Z" });
    await createInteraction([recent.id], { occurredAt: "2024-01-01T00:00:00.000Z" });
    const list = await json<ListResult<ContactSummary>>("/api/contacts?sort=lastContacted&limit=200");
    const ours = new Set([recent.id, stale.id, never.id]);
    expect(list.body.items.map((x) => x.id).filter((id) => ours.has(id))).toEqual([recent.id, stale.id, never.id]);
  });
});
