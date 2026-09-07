import { afterEach, describe, expect, it } from "vitest";
import type { ActivityEventOut, ContactMethodOut, GeocodeSearchResult, InteractionOut, MapPinsResult, ReverseGeocodeResult } from "@shared/types";
import { api, createContact, createInteraction, json } from "./helpers";

const BRISTOL = { lat: 51.4545, lng: -2.5879 };
const LEEDS = { lat: 53.8008, lng: -1.5491 };
const AROUND_LEEDS = { lat: 53.8008, lng: -1.5491, radius: 12_000 };

async function addAddress(contactId: string, value: string, coordinates: { lat: number; lng: number } | null, extra: Record<string, unknown> = {}) {
  const { status, body } = await json<ContactMethodOut>(`/api/contacts/${contactId}/methods`, { method: "POST", body: { type: "address", value, coordinates, ...extra } });
  if (status !== 201) throw new Error(`addAddress failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

async function pins(query = ""): Promise<MapPinsResult> {
  const { status, body } = await json<MapPinsResult>(`/api/map/pins${query}`);
  if (status !== 200) throw new Error(`pins failed: ${status} ${JSON.stringify(body)}`);
  return body;
}

describe("coordinates on contact methods and interactions", () => {
  it("round-trips coordinates on an address and logs the change", async () => {
    const c = await createContact({ firstName: "Pinned", methods: [{ type: "address", value: "1 Harbourside, Bristol", coordinates: BRISTOL }] });
    expect(c.methods[0]?.coordinates).toEqual(BRISTOL);

    const moved = await json<ContactMethodOut>(`/api/contacts/${c.id}/methods/${c.methods[0]!.id}`, { method: "PATCH", body: { coordinates: LEEDS } });
    expect(moved.status).toBe(200);
    expect(moved.body.coordinates).toEqual(LEEDS);

    const rough = await json<ContactMethodOut>(`/api/contacts/${c.id}/methods/${c.methods[0]!.id}`, { method: "PATCH", body: { coordinates: AROUND_LEEDS } });
    expect(rough.body.coordinates).toEqual(AROUND_LEEDS);

    const cleared = await json<ContactMethodOut>(`/api/contacts/${c.id}/methods/${c.methods[0]!.id}`, { method: "PATCH", body: { coordinates: null } });
    expect(cleared.body.coordinates).toBeNull();

    const log = await json<{ items: ActivityEventOut[] }>("/api/activity?eventType=contact_method.updated");
    const mine = log.body.items.filter((e) => e.entityId === c.methods[0]!.id);
    expect(mine).toHaveLength(3);
    expect(mine.map((e) => (e.payload as { changes: Record<string, unknown> }).changes.coordinates)).toEqual([
      { from: BRISTOL, to: LEEDS },
      { from: LEEDS, to: AROUND_LEEDS },
      { from: AROUND_LEEDS, to: null },
    ]);
  });

  it("round-trips coordinates on an interaction", async () => {
    const a = await createContact({ firstName: "Walker" });
    const x = await createInteraction([a.id], { summary: "Walk", location: "Harbourside", coordinates: BRISTOL });
    expect(x.coordinates).toEqual(BRISTOL);
    const somewhere = await createInteraction([a.id], { summary: "Somewhere in Leeds", coordinates: AROUND_LEEDS });
    expect(somewhere.coordinates).toEqual(AROUND_LEEDS);
    const scoped = await pins(`?contactId=${a.id}`);
    expect(scoped.items.find((p) => p.kind === "interaction" && p.interactionId === somewhere.id)?.coordinates).toEqual(AROUND_LEEDS);
    const got = await json<InteractionOut>(`/api/interactions/${x.id}`);
    expect(got.body.coordinates).toEqual(BRISTOL);
    const upd = await json<InteractionOut>(`/api/interactions/${x.id}`, { method: "PATCH", body: { coordinates: null } });
    expect(upd.body.coordinates).toBeNull();
    // A patch that leaves coordinates out keeps them.
    await json(`/api/interactions/${x.id}`, { method: "PATCH", body: { coordinates: LEEDS } });
    const kept = await json<InteractionOut>(`/api/interactions/${x.id}`, { method: "PATCH", body: { summary: "Long walk" } });
    expect(kept.body.coordinates).toEqual(LEEDS);
  });

  it("rejects out-of-range and half-given coordinates", async () => {
    const a = await createContact({ firstName: "Strict" });
    const outOfRange = await json(`/api/contacts/${a.id}/methods`, { method: "POST", body: { type: "address", value: "x", coordinates: { lat: 91, lng: 0 } } });
    expect(outOfRange.status).toBe(400);
    const half = await json(`/api/contacts/${a.id}/methods`, { method: "POST", body: { type: "address", value: "x", coordinates: { lat: 1 } } });
    expect(half.status).toBe(400);
    const badRadius = await json(`/api/contacts/${a.id}/methods`, { method: "POST", body: { type: "address", value: "x", coordinates: { lat: 1, lng: 1, radius: 0 } } });
    expect(badRadius.status).toBe(400);
    const badInteraction = await json("/api/interactions", {
      method: "POST",
      body: { type: "call", occurredAt: new Date().toISOString(), summary: "x", contactIds: [a.id], coordinates: { lat: 0, lng: 181 } },
    });
    expect(badInteraction.status).toBe(400);
  });
});

describe("GET /api/map/pins", () => {
  it("pins contacts at their addresses and interactions where they happened", async () => {
    const a = await createContact({ firstName: "Ada", lastName: "Map" });
    const b = await createContact({ firstName: "Ben", lastName: "Map" });
    const home = await addAddress(a.id, "1 Harbourside, Bristol", BRISTOL, { label: "home" });
    await addAddress(a.id, "No coordinates yet", null);
    // Coordinates on a non-address method are stored but never pinned.
    await json(`/api/contacts/${a.id}/methods`, { method: "POST", body: { type: "url", value: "https://example.com", coordinates: LEEDS } });
    const walk = await createInteraction([a.id, b.id], { summary: "Walk", location: "Roundhay Park", coordinates: LEEDS });
    await createInteraction([b.id], { summary: "Call, no place" });

    const all = await pins();
    const contactPin = all.items.find((p) => p.kind === "contact" && p.methodId === home.id);
    expect(contactPin).toMatchObject({
      kind: "contact",
      id: `method:${home.id}`,
      contact: { id: a.id, displayName: "Ada Map", deceased: false },
      label: "home",
      address: "1 Harbourside, Bristol",
      coordinates: BRISTOL,
    });
    expect(all.items.filter((p) => p.kind === "contact" && p.contact.id === a.id)).toHaveLength(1);

    const interactionPin = all.items.find((p) => p.kind === "interaction" && p.interactionId === walk.id);
    expect(interactionPin).toMatchObject({ kind: "interaction", id: `interaction:${walk.id}`, summary: "Walk", location: "Roundhay Park", coordinates: LEEDS });
    expect(interactionPin && interactionPin.kind === "interaction" ? interactionPin.participants.map((p) => p.id).sort() : []).toEqual([a.id, b.id].sort());
    expect(all.items.filter((p) => p.kind === "interaction" && p.interactionId === walk.id)).toHaveLength(1);
    expect(all.counts.contacts).toBeGreaterThanOrEqual(1);
    expect(all.counts.interactions).toBeGreaterThanOrEqual(1);
  });

  it("scopes to one contact: their addresses and the interactions they took part in", async () => {
    const a = await createContact({ firstName: "Scoped" });
    const b = await createContact({ firstName: "Other" });
    await addAddress(a.id, "A's place", BRISTOL);
    const bHome = await addAddress(b.id, "B's place", LEEDS);
    const shared = await createInteraction([a.id, b.id], { summary: "Shared", coordinates: BRISTOL });
    const bOnly = await createInteraction([b.id], { summary: "B only", coordinates: LEEDS });

    const scoped = await pins(`?contactId=${a.id}`);
    expect(scoped.items.filter((p) => p.kind === "contact").map((p) => p.contact.id)).toEqual([a.id]);
    expect(scoped.items.some((p) => p.kind === "contact" && p.methodId === bHome.id)).toBe(false);
    const interactionIds = scoped.items.filter((p) => p.kind === "interaction").map((p) => p.interactionId);
    expect(interactionIds).toContain(shared.id);
    expect(interactionIds).not.toContain(bOnly.id);
    expect(interactionIds.filter((id) => id === shared.id)).toHaveLength(1);
    expect(scoped.counts).toEqual({ contacts: 1, interactions: 1 });

    const missing = await api("/api/map/pins?contactId=01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(missing.status).toBe(404);
    const anon = await api("/api/map/pins", { anonymous: true });
    expect(anon.status).toBe(401);
  });

  it("hides archived and deceased contacts unless asked, but keeps them when scoped", async () => {
    const archived = await createContact({ firstName: "Shelved" });
    const home = await addAddress(archived.id, "Old place", BRISTOL);
    await json(`/api/contacts/${archived.id}/archive`, { method: "POST" });
    const gone = await createContact({ firstName: "Late" });
    const goneHome = await addAddress(gone.id, "Former place", LEEDS);
    await json(`/api/contacts/${gone.id}/deceased`, { method: "POST", body: {} });

    const byDefault = await pins();
    expect(byDefault.items.some((p) => p.kind === "contact" && p.methodId === home.id)).toBe(false);
    expect(byDefault.items.some((p) => p.kind === "contact" && p.methodId === goneHome.id)).toBe(false);
    const withArchived = await pins("?archived=true");
    expect(withArchived.items.some((p) => p.kind === "contact" && p.methodId === home.id)).toBe(true);
    expect(withArchived.items.some((p) => p.kind === "contact" && p.methodId === goneHome.id)).toBe(false);
    const scoped = await pins(`?contactId=${archived.id}`);
    expect(scoped.items.map((p) => p.id)).toEqual([`method:${home.id}`]);
    const scopedGone = await pins(`?contactId=${gone.id}`);
    expect(scopedGone.items.map((p) => p.id)).toEqual([`method:${goneHome.id}`]);
    expect(scopedGone.items[0]?.kind === "contact" ? scopedGone.items[0].contact.deceased : null).toBe(true);
  });

  it("drops the pin when coordinates are cleared", async () => {
    const a = await createContact({ firstName: "Clearer" });
    const home = await addAddress(a.id, "Somewhere", BRISTOL);
    expect((await pins(`?contactId=${a.id}`)).items).toHaveLength(1);
    await json(`/api/contacts/${a.id}/methods/${home.id}`, { method: "PATCH", body: { coordinates: null } });
    expect((await pins(`?contactId=${a.id}`)).items).toHaveLength(0);
  });
});

type Seen = { url: URL; headers: Headers };

/** Install a scripted Nominatim: every call gets the given response (or a Response the script builds). */
function installGeocoder(respond: (seen: Seen) => Response | unknown): Seen[] {
  const seen: Seen[] = [];
  (globalThis as { __geocodeFakeUpstream?: typeof fetch }).__geocodeFakeUpstream = async (input, init) => {
    const req = new Request(input, init);
    const s: Seen = { url: new URL(req.url), headers: req.headers };
    seen.push(s);
    const out = respond(s);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  };
  return seen;
}

describe("GET /api/geocode", () => {
  afterEach(() => {
    delete (globalThis as { __geocodeFakeUpstream?: unknown }).__geocodeFakeUpstream;
  });

  it("searches through Nominatim with an identifying User-Agent and maps the results", async () => {
    const seen = installGeocoder(() => [
      { place_id: 1, lat: "51.4545", lon: "-2.5879", display_name: "Bristol, England, United Kingdom", type: "city", category: "place", boundingbox: ["51.3973", "51.5444", "-2.7302", "-2.5105"] },
      { place_id: 2, lat: "not a number", lon: "0", display_name: "Broken" },
      { place_id: 3, lat: "40.1", lon: "-3.2", display_name: "Somewhere else", category: "boundary" },
      { place_id: 4, lat: "51.45", lon: "-2.6", display_name: "12 Harbourside", type: "house", boundingbox: ["51.4499", "51.4501", "-2.6001", "-2.5999"] },
    ]);
    const res = await json<GeocodeSearchResult>("/api/geocode?q=Bristol%20search%20one", { headers: { "accept-language": "en-GB,en;q=0.9" } });
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      // Half the box diagonal (~11.4 km), rounded to two significant figures.
      { label: "Bristol, England, United Kingdom", lat: 51.4545, lng: -2.5879, kind: "city", radius: 11_000 },
      { label: "Somewhere else", lat: 40.1, lng: -3.2, kind: "boundary", radius: null },
      // A house is a spot, not an area.
      { label: "12 Harbourside", lat: 51.45, lng: -2.6, kind: "house", radius: null },
    ]);
    expect(seen).toHaveLength(1);
    const u = seen[0]!.url;
    expect(u.origin + u.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(u.searchParams.get("format")).toBe("jsonv2");
    expect(u.searchParams.get("limit")).toBe("5");
    expect(u.searchParams.get("q")).toBe("Bristol search one");
    expect(u.searchParams.get("accept-language")).toBe("en-GB,en;q=0.9");
    expect(seen[0]!.headers.get("user-agent")).toMatch(/^opsec /);
  });

  it("reverse geocodes a position and reports nothing for the open sea", async () => {
    const seen = installGeocoder((s) =>
      s.url.searchParams.get("lat") === "0" ? { error: "Unable to geocode" } : { lat: "51.45", lon: "-2.59", display_name: "Harbourside, Bristol", type: "quarter" },
    );
    const land = await json<ReverseGeocodeResult>("/api/geocode/reverse?lat=51.45&lng=-2.59");
    expect(land.status).toBe(200);
    expect(land.body.result).toEqual({ label: "Harbourside, Bristol", lat: 51.45, lng: -2.59, kind: "quarter", radius: null });
    expect(seen[0]!.url.pathname).toBe("/reverse");
    expect(seen[0]!.url.searchParams.get("lon")).toBe("-2.59");
    const sea = await json<ReverseGeocodeResult>("/api/geocode/reverse?lat=0&lng=0");
    expect(sea.body.result).toBeNull();
  });

  it("validates input and maps upstream failures to 502 without echoing them", async () => {
    const short = await json("/api/geocode?q=ab");
    expect(short.status).toBe(400);
    const badLat = await json("/api/geocode/reverse?lat=99&lng=0");
    expect(badLat.status).toBe(400);

    installGeocoder(() => new Response("<html>Too Many Requests: secret detail</html>", { status: 429 }));
    const limited = await json<{ error: { code: string; message: string } }>("/api/geocode?q=rate%20limited%20query");
    expect(limited.status).toBe(502);
    expect(limited.body.error.code).toBe("geocode_unavailable");
    expect(JSON.stringify(limited.body)).not.toContain("secret detail");

    installGeocoder(() => new Response("oops", { status: 500 }));
    expect((await api("/api/geocode?q=server%20error%20query")).status).toBe(502);

    installGeocoder(() => new Response("not json", { status: 200 }));
    expect((await api("/api/geocode?q=garbage%20query")).status).toBe(502);
  });
});
