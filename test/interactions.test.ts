import { describe, expect, it } from "vitest";
import type { ActivityEventOut, ContactDetail, FeedResult, InteractionOut, ListResult } from "@shared/types";
import { api, createContact, createInteraction, json } from "./helpers";

describe("interactions", () => {
  it("logs a multi-participant interaction into every participant's feed", async () => {
    const a = await createContact({ firstName: "Alice" });
    const b = await createContact({ firstName: "Bob" });
    const created = await createInteraction([a.id, b.id], { type: "meal", summary: "Dinner", body: "Talked about **trips**", location: "Home" });
    expect(created.participants.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());

    for (const id of [a.id, b.id]) {
      const feed = await json<FeedResult>(`/api/contacts/${id}/activity`);
      const item = feed.body.items.find((i) => i.kind === "interaction");
      expect(item && item.kind === "interaction" ? item.interaction.id : null).toBe(created.id);
      // The creation event is folded into the interaction card, not duplicated.
      expect(feed.body.items.some((i) => i.kind === "event" && i.event.eventType === "interaction.created")).toBe(false);
      const detail = await json<ContactDetail>(`/api/contacts/${id}`);
      expect(detail.body.lastInteraction?.id).toBe(created.id);
      expect(detail.body.lastInteraction?.summary).toBe("Dinner");
    }
    const raw = await json<{ items: ActivityEventOut[] }>("/api/activity?eventType=interaction.created");
    expect(raw.body.items.filter((e) => e.entityId === created.id)).toHaveLength(2);
  });

  it("logs a mention on contacts tagged in the details but not participating", async () => {
    const a = await createContact({ firstName: "Alice" });
    const b = await createContact({ firstName: "Bob" });
    const c = await createContact({ firstName: "Carol" });
    const body = `Talked about [@Bob](/contacts/${b.id}) and #holiday plans. [@Alice](/contacts/${a.id}) too. [@Ghost](/contacts/01ARZ3NDEKTSV4RRFFQ69G5FAV)`;
    const it1 = await createInteraction([a.id], { summary: "Coffee", body });
    // Bob is mentioned (not a participant): feed entry. Alice is a participant: no mention entry.
    const bFeed = await json<FeedResult>(`/api/contacts/${b.id}/activity`);
    const mention = bFeed.body.items.find((i) => i.kind === "event" && i.event.eventType === "interaction.mentioned");
    expect(mention && mention.kind === "event" ? mention.event.payload : null).toMatchObject({ summary: "Coffee", participantIds: [a.id] });
    const aFeed = await json<FeedResult>(`/api/contacts/${a.id}/activity`);
    expect(aFeed.body.items.some((i) => i.kind === "event" && i.event.eventType === "interaction.mentioned")).toBe(false);
    // Editing to mention Carol logs for Carol only; Bob is not logged again.
    await json(`/api/interactions/${it1.id}`, { method: "PATCH", body: { body: `${body} and [@Carol](/contacts/${c.id})` } });
    const cFeed = await json<FeedResult>(`/api/contacts/${c.id}/activity`);
    expect(cFeed.body.items.filter((i) => i.kind === "event" && i.event.eventType === "interaction.mentioned")).toHaveLength(1);
    const bFeed2 = await json<FeedResult>(`/api/contacts/${b.id}/activity`);
    expect(bFeed2.body.items.filter((i) => i.kind === "event" && i.event.eventType === "interaction.mentioned")).toHaveLength(1);
  });

  it("derives lastInteraction from the newest occurredAt, not creation order", async () => {
    const a = await createContact({ firstName: "Alice" });
    const newer = await createInteraction([a.id], { occurredAt: "2024-06-01T12:00:00.000Z", summary: "newer" });
    await createInteraction([a.id], { occurredAt: "2023-01-01T12:00:00.000Z", summary: "backdated" });
    const detail = await json<ContactDetail>(`/api/contacts/${a.id}`);
    expect(detail.body.lastInteraction?.id).toBe(newer.id);
    const list = await json<ListResult<InteractionOut>>(`/api/contacts/${a.id}/interactions`);
    expect(list.body.total).toBe(2);
    expect(list.body.items.map((i) => i.summary)).toEqual(["newer", "backdated"]);
  });

  it("rejects unknown participants and empty participant lists", async () => {
    const a = await createContact({ firstName: "Alice" });
    const bad = await json("/api/interactions", {
      method: "POST",
      body: { type: "call", occurredAt: new Date().toISOString(), summary: "x", contactIds: [a.id, "missing"] },
    });
    expect(bad.status).toBe(400);
    const empty = await json("/api/interactions", { method: "POST", body: { type: "call", occurredAt: new Date().toISOString(), summary: "x", contactIds: [] } });
    expect(empty.status).toBe(400);
  });

  it("updates participants and fields, then deletes", async () => {
    const a = await createContact({ firstName: "Alice" });
    const b = await createContact({ firstName: "Bob" });
    const it1 = await createInteraction([a.id], { summary: "one" });
    const upd = await json<InteractionOut>(`/api/interactions/${it1.id}`, { method: "PATCH", body: { summary: "two", contactIds: [a.id, b.id] } });
    expect(upd.status).toBe(200);
    expect(upd.body.summary).toBe("two");
    expect(upd.body.participants).toHaveLength(2);
    const bFeed = await json<FeedResult>(`/api/contacts/${b.id}/activity`);
    expect(bFeed.body.items.some((i) => i.kind === "event" && i.event.eventType === "interaction.updated")).toBe(true);

    const del = await api(`/api/interactions/${it1.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    expect((await json(`/api/interactions/${it1.id}`)).status).toBe(404);
    const aFeed = await json<FeedResult>(`/api/contacts/${a.id}/activity`);
    expect(aFeed.body.items.some((i) => i.kind === "interaction")).toBe(false);
    expect(aFeed.body.items.some((i) => i.kind === "event" && i.event.eventType === "interaction.deleted")).toBe(true);
    expect((await json<ContactDetail>(`/api/contacts/${a.id}`)).body.lastInteraction).toBeNull();
  });

  it("life events: CRUD, feed placement by date, and activity log", async () => {
    const a = await createContact({ firstName: "Life" });
    const created = await json<{ id: string; category: string; occurredOn: string }>(`/api/contacts/${a.id}/life-events`, {
      method: "POST",
      body: { category: "work_education", title: "Started at Acme Ltd", occurredOn: "2021-09", body: "Graduate scheme" },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ category: "work_education", occurredOn: "2021-09" });
    const bad = await json(`/api/contacts/${a.id}/life-events`, { method: "POST", body: { category: "hobbies", title: "x", occurredOn: "2021" } });
    expect(bad.status).toBe(400);

    await createInteraction([a.id], { occurredAt: "2022-01-01T10:00:00.000Z", summary: "later call" });
    const feed = await json<FeedResult>(`/api/contacts/${a.id}/activity`);
    const kinds = feed.body.items.map((i) => i.kind);
    // Newest first: the 2022 interaction, then the 2021 life event; no duplicate "created" event for it.
    expect(kinds.indexOf("interaction")).toBeLessThan(kinds.indexOf("lifeEvent"));
    expect(feed.body.items.some((i) => i.kind === "event" && i.event.eventType === "life_event.created")).toBe(false);

    const upd = await json<{ title: string }>(`/api/life-events/${created.body.id}`, { method: "PATCH", body: { title: "Started at Acme Ltd (audit)" } });
    expect(upd.body.title).toBe("Started at Acme Ltd (audit)");
    const list = await json<{ items: { id: string }[] }>(`/api/contacts/${a.id}/life-events`);
    expect(list.body.items.map((l) => l.id)).toEqual([created.body.id]);
    expect((await api(`/api/life-events/${created.body.id}`, { method: "DELETE" })).status).toBe(204);
    const feed2 = await json<FeedResult>(`/api/contacts/${a.id}/activity`);
    expect(feed2.body.items.some((i) => i.kind === "lifeEvent")).toBe(false);
    expect(feed2.body.items.some((i) => i.kind === "event" && i.event.eventType === "life_event.deleted")).toBe(true);
  });

  it("pages the feed with nextBefore", async () => {
    const a = await createContact({ firstName: "Pager" });
    for (let i = 0; i < 5; i++) {
      await createInteraction([a.id], { occurredAt: `2024-01-0${i + 1}T10:00:00.000Z`, summary: `i${i}` });
    }
    const first = await json<FeedResult>(`/api/contacts/${a.id}/activity?limit=3`);
    expect(first.body.items).toHaveLength(3);
    expect(first.body.nextBefore).not.toBeNull();
    const second = await json<FeedResult>(`/api/contacts/${a.id}/activity?limit=3&before=${encodeURIComponent(first.body.nextBefore!)}`);
    const seen = new Set([...first.body.items, ...second.body.items].map((i) => (i.kind === "interaction" ? i.interaction.id : i.kind === "lifeEvent" ? i.lifeEvent.id : i.event.id)));
    // 5 interactions + 1 contact.created event = 6 distinct items
    expect(seen.size).toBe(6);
  });

  it("raw activity log pages with since cursor", async () => {
    const a = await createContact({ firstName: "Log" });
    await json(`/api/contacts/${a.id}`, { method: "PATCH", body: { nickname: "L" } });
    const page1 = await json<{ items: ActivityEventOut[]; nextSince: string | null }>("/api/activity?limit=1");
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.nextSince).toBe(page1.body.items[0].id);
    const page2 = await json<{ items: ActivityEventOut[] }>(`/api/activity?since=${page1.body.nextSince}`);
    expect(page2.body.items[0].id > page1.body.items[0].id).toBe(true);
  });
});
