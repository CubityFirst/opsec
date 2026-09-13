import { describe, expect, it } from "vitest";
import type { BetOut, GiftOut, LifeEventOut, TimelineResult } from "@shared/types";
import { createContact, createInteraction, json } from "./helpers";

const get = (qs: string) => json<TimelineResult>(`/api/timeline?${qs}`);

describe("timeline", () => {
  it("merges every kind inside the range, newest first, with counts", async () => {
    const alice = await createContact({ firstName: "Time", lastName: "Alice" });
    const bob = await createContact({ firstName: "Time", lastName: "Bob" });
    // Use a far-off year so other test files' data never lands in the window.
    const inRange = await createInteraction([alice.id, bob.id], { occurredAt: "2301-03-10T12:00:00Z", summary: "Lunch in March" });
    const edge = await createInteraction([alice.id], { occurredAt: "2301-03-31T23:30:00Z", summary: "Late on the last day" });
    const before = await createInteraction([alice.id], { occurredAt: "2301-02-28T23:59:59Z", summary: "February" });
    const after = await createInteraction([alice.id], { occurredAt: "2301-04-01T00:00:00Z", summary: "April" });

    const dated = await json<LifeEventOut>(`/api/contacts/${alice.id}/life-events`, { method: "POST", body: { category: "home_living", title: "Moved", occurredOn: "2301-03-05" } });
    const monthOnly = await json<LifeEventOut>(`/api/contacts/${bob.id}/life-events`, { method: "POST", body: { category: "work_education", title: "New job", occurredOn: "2301-03" } });
    const yearOnly = await json<LifeEventOut>(`/api/contacts/${bob.id}/life-events`, { method: "POST", body: { category: "travel_experiences", title: "Big trip", occurredOn: "2301" } });
    const otherMonth = await json<LifeEventOut>(`/api/contacts/${bob.id}/life-events`, { method: "POST", body: { category: "work_education", title: "Promotion", occurredOn: "2301-05" } });
    for (const r of [dated, monthOnly, yearOnly, otherMonth]) expect(r.status).toBe(201);

    const gift = await json<GiftOut>(`/api/contacts/${alice.id}/gifts`, { method: "POST", body: { name: "Scarf", status: "given", givenOn: "2301-03-20" } });
    const idea = await json<GiftOut>(`/api/contacts/${alice.id}/gifts`, { method: "POST", body: { name: "Idea only", status: "idea" } });
    const bet = await json<BetOut>(`/api/contacts/${bob.id}/bets`, { method: "POST", body: { prediction: "Snow in March", madeOn: "2301-03-01", reviewOn: "2301-03-31" } });
    for (const r of [gift, idea, bet]) expect(r.status).toBe(201);

    const { status, body } = await get("from=2301-03-01&to=2301-03-31");
    expect(status).toBe(200);
    expect(body.counts).toEqual({ interaction: 2, lifeEvent: 3, gift: 1, bet: 1 });

    const ids = body.items.map((i) => (i.kind === "interaction" ? i.interaction.id : i.kind === "lifeEvent" ? i.lifeEvent.id : i.kind === "gift" ? i.gift.id : i.bet.id));
    expect(ids).toContain(inRange.id);
    expect(ids).toContain(edge.id);
    expect(ids).not.toContain(before.id);
    expect(ids).not.toContain(after.id);
    expect(ids).toContain(dated.body.id);
    expect(ids).toContain(monthOnly.body.id);
    expect(ids).toContain(yearOnly.body.id);
    expect(ids).not.toContain(otherMonth.body.id);
    expect(ids).toContain(gift.body.id);
    expect(ids).not.toContain(idea.body.id);
    expect(ids).toContain(bet.body.id);

    // Newest first; the interaction carries its participants and the life event its contact.
    const ats = body.items.map((i) => i.at);
    expect([...ats].sort().reverse()).toEqual(ats);
    const lunch = body.items.find((i) => i.kind === "interaction" && i.interaction.id === inRange.id);
    expect(lunch && lunch.kind === "interaction" ? lunch.interaction.participants.map((p) => p.displayName).sort() : []).toEqual(["Time Alice", "Time Bob"]);
    const moved = body.items.find((i) => i.kind === "lifeEvent" && i.lifeEvent.id === dated.body.id);
    expect(moved && moved.kind === "lifeEvent" ? moved.contact.id : null).toBe(alice.id);
    const made = body.items.find((i) => i.kind === "bet" && i.bet.id === bet.body.id);
    expect(made && made.kind === "bet" ? made.event : null).toBe("made");
  });

  it("filters by kind while keeping full counts, and shows a settlement on the day it happened", async () => {
    const carol = await createContact({ firstName: "Time", lastName: "Carol" });
    await createInteraction([carol.id], { occurredAt: "2302-06-15T09:00:00Z", summary: "June call" });
    const bet = await json<BetOut>(`/api/contacts/${carol.id}/bets`, { method: "POST", body: { prediction: "Heatwave", madeOn: "2302-05-01", reviewOn: "2302-06-30" } });
    expect(bet.status).toBe(201);
    const settled = await json<BetOut>(`/api/bets/${bet.body.id}/settle`, { method: "POST", body: { outcome: "me" } });
    expect(settled.status).toBe(200);
    const today = new Date().toISOString().slice(0, 10);

    const june = await get("from=2302-06-01&to=2302-06-30&kinds=bet");
    expect(june.body.counts.interaction).toBe(1);
    expect(june.body.items.every((i) => i.kind === "bet")).toBe(true);
    // Made in May, so nothing in June under bets unless it was settled today in June (it was not).
    expect(june.body.items.find((i) => i.kind === "bet" && i.bet.id === bet.body.id)).toBeUndefined();

    const settledDay = await get(`from=${today}&to=${today}&kinds=bet`);
    const item = settledDay.body.items.find((i) => i.kind === "bet" && i.bet.id === bet.body.id);
    expect(item && item.kind === "bet" ? item.event : null).toBe("settled");

    const unknownKind = await get("from=2302-06-01&to=2302-06-30&kinds=nope");
    expect(unknownKind.status).toBe(200);
    expect(unknownKind.body.items).toEqual([]);
    expect(unknownKind.body.counts.interaction).toBe(1);
  });

  it("rejects bad ranges", async () => {
    expect((await get("from=2302-06-30&to=2302-06-01")).status).toBe(400);
    expect((await get("from=2302-01-01&to=2303-12-31")).status).toBe(400);
    expect((await get("from=2302-01-01")).status).toBe(400);
    expect((await get("from=2302-01-01&to=2303-02-04")).status).toBe(200);
  });
});
