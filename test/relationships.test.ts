import { describe, expect, it } from "vitest";
import type { ApiErrorBody, FeedResult, ListResult, RelationshipOut, RelationshipTypeOut } from "@shared/types";
import { api, createContact, createRelationship, json } from "./helpers";

describe("relationship types", () => {
  it("are seeded with valid inverses", async () => {
    const { body } = await json<ListResult<RelationshipTypeOut>>("/api/relationship-types");
    expect(body.items.length).toBeGreaterThan(10);
    const keys = new Set(body.items.map((t) => t.key));
    for (const t of body.items) expect(keys.has(t.inverseKey), `${t.key} inverse`).toBe(true);
    expect(body.items.find((t) => t.key === "parent")?.inverseKey).toBe("child");
    expect(body.items.find((t) => t.key === "owner")?.inverseKey).toBe("pet");
  });
});

describe("relationships", () => {
  it("shows a relationship from both sides with the inverse label", async () => {
    const alice = await createContact({ firstName: "Alice" });
    const bob = await createContact({ firstName: "Bob" });
    const rel = await createRelationship(alice.id, bob.id, "parent", { label: "adoptive" });
    expect(rel.fromContactId).toBe(alice.id);

    const fromAlice = await json<ListResult<RelationshipOut>>(`/api/contacts/${alice.id}/relationships`);
    expect(fromAlice.body.items).toHaveLength(1);
    // Alice is the parent of Bob, so Bob appears on Alice's page as her Child.
    expect(fromAlice.body.items[0]).toMatchObject({ typeKey: "child", typeLabel: "Child", direction: "outgoing", label: "adoptive" });
    expect(fromAlice.body.items[0].otherContact.id).toBe(bob.id);

    const fromBob = await json<ListResult<RelationshipOut>>(`/api/contacts/${bob.id}/relationships`);
    expect(fromBob.body.items[0]).toMatchObject({ typeKey: "parent", typeLabel: "Parent", direction: "incoming" });
    expect(fromBob.body.items[0].otherContact.id).toBe(alice.id);

    const bobFeed = await json<FeedResult>(`/api/contacts/${bob.id}/activity`);
    const added = bobFeed.body.items.find((i) => i.kind === "event" && i.event.eventType === "relationship.added");
    expect(added && added.kind === "event" ? added.event.payload : null).toMatchObject({ typeLabel: "Parent", otherContactId: alice.id });
  });

  it("links a pet to its owner and shows the pet under the owner", async () => {
    const owner = await createContact({ firstName: "Owner" });
    const rex = await createContact({ kind: "pet", firstName: "Rex" });
    await createRelationship(owner.id, rex.id, "owner");
    const rexSide = await json<ListResult<RelationshipOut>>(`/api/contacts/${rex.id}/relationships`);
    expect(rexSide.body.items[0]).toMatchObject({ typeLabel: "Owner", direction: "incoming" });
    const ownerSide = await json<ListResult<RelationshipOut>>(`/api/contacts/${owner.id}/relationships`);
    expect(ownerSide.body.items[0]).toMatchObject({ typeLabel: "Pet" });
    expect((await json<{ relationshipCount: number }>(`/api/contacts/${owner.id}`)).body.relationshipCount).toBe(1);
  });

  it("rejects self-links, unknown types, unknown contacts and duplicates", async () => {
    const a = await createContact({ firstName: "A" });
    const b = await createContact({ firstName: "B" });
    let r = await json<ApiErrorBody>("/api/relationships", { method: "POST", body: { fromContactId: a.id, toContactId: a.id, typeKey: "friend" } });
    expect(r.status).toBe(400);
    r = await json<ApiErrorBody>("/api/relationships", { method: "POST", body: { fromContactId: a.id, toContactId: b.id, typeKey: "nemesis" } });
    expect(r.status).toBe(400);
    r = await json<ApiErrorBody>("/api/relationships", { method: "POST", body: { fromContactId: a.id, toContactId: "nope", typeKey: "friend" } });
    expect(r.status).toBe(400);
    await createRelationship(a.id, b.id, "parent");
    r = await json<ApiErrorBody>("/api/relationships", { method: "POST", body: { fromContactId: b.id, toContactId: a.id, typeKey: "child" } });
    expect(r.status).toBe(409);
  });

  it("scopes types by the kinds on each end", async () => {
    const { body } = await json<ListResult<RelationshipTypeOut>>("/api/relationship-types");
    const byKey = new Map(body.items.map((t) => [t.key, t]));
    expect(byKey.get("parent")?.fromKinds).not.toContain("organization");
    expect(byKey.get("employer")?.fromKinds).toContain("organization");
    expect(byKey.get("owner")?.toKinds).toEqual(["pet"]);
    expect(byKey.get("subsidiary")?.fromKinds).toEqual(["organization"]);
    expect(byKey.get("other")?.fromKinds).toHaveLength(3);

    const person = await createContact({ firstName: "Pat" });
    const org = await createContact({ kind: "organization", firstName: "Acme" });
    const pet = await createContact({ kind: "pet", firstName: "Rex" });

    // An organisation cannot be someone's parent.
    const bad = await json<ApiErrorBody>("/api/relationships", { method: "POST", body: { fromContactId: org.id, toContactId: person.id, typeKey: "parent" } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain("cannot link");
    // A person cannot be the owner of another person.
    const other = await createContact({ firstName: "Sam" });
    expect((await json("/api/relationships", { method: "POST", body: { fromContactId: person.id, toContactId: other.id, typeKey: "owner" } })).status).toBe(400);
    // But these fit.
    await createRelationship(org.id, person.id, "employer");
    await createRelationship(person.id, pet.id, "owner");
    await createRelationship(org.id, pet.id, "vet");
    // Changing the type is validated the same way.
    const rel = await createRelationship(person.id, org.id, "member");
    const upd = await json<ApiErrorBody>(`/api/relationships/${rel.id}`, { method: "PATCH", body: { typeKey: "spouse" } });
    expect(upd.status).toBe(400);
  });

  it("updates and deletes", async () => {
    const a = await createContact({ firstName: "A" });
    const b = await createContact({ firstName: "B" });
    const rel = await createRelationship(a.id, b.id, "friend");
    const upd = await json<{ label: string | null; typeKey: string }>(`/api/relationships/${rel.id}`, { method: "PATCH", body: { label: "best mate", typeKey: "colleague" } });
    expect(upd.body).toMatchObject({ label: "best mate", typeKey: "colleague" });
    const del = await api(`/api/relationships/${rel.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    const list = await json<ListResult<RelationshipOut>>(`/api/contacts/${a.id}/relationships`);
    expect(list.body.items).toHaveLength(0);
    const feed = await json<FeedResult>(`/api/contacts/${b.id}/activity`);
    expect(feed.body.items.some((i) => i.kind === "event" && i.event.eventType === "relationship.removed")).toBe(true);
  });
});
