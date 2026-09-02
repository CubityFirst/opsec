import { isLocalDev } from "../middleware/auth";
import { Hono } from "hono";
import { schema } from "../db";
import type { AppEnv } from "../env";
import { ApiError } from "../lib/errors";

/**
 * Development-only helpers. Mounted unconditionally but every handler checks
 * `ENVIRONMENT` at request time (Hono apps are module singletons).
 */
const app = new Hono<AppEnv>();

app.use("/dev/*", async (c, next) => {
  // Only a local dev server: never on a deployed hostname, whatever the var says.
  if (!isLocalDev(new URL(c.req.url), c.env)) throw ApiError.notFound("Route");
  await next();
});

const daysAgo = (n: number, hour = 18) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

app.post("/dev/seed", async (c) => {
  const db = c.get("db");
  // Wipe. Cascades clear methods, tags links, relationships, interactions, files, activity.
  const fileRows = await db.select({ r2Key: schema.files.r2Key }).from(schema.files);
  if (fileRows.length > 0) await c.env.BUCKET.delete(fileRows.map((f) => f.r2Key));
  await db.batch([db.delete(schema.contacts), db.delete(schema.tags), db.delete(schema.interactions)]);

  // Re-enter through the public API so activity rows are produced exactly as in real use.
  const { default: root } = await import("../index");
  const call = async <T>(path: string, body: unknown, method = "POST"): Promise<T> => {
    const res = await root.request(`/api${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, c.env);
    if (!res.ok) throw new Error(`Seed call ${method} ${path} failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  };
  type Created = { id: string };

  const alice = await call<Created>("/contacts", {
    kind: "person",
    firstName: "Alice",
    lastName: "Hartley",
    nickname: "Al",
    birthday: "1988-05-14",
    notes: "Met at the climbing gym in 2019. Loves board games and sourdough.",
    methods: [
      { type: "phone", label: "mobile", value: "+44 7700 900123", isPrimary: true },
      { type: "email", label: "personal", value: "alice@example.com", isPrimary: true },
      { type: "address", label: "home", value: JSON.stringify({ line1: "12 Elm Street", city: "Bristol", postcode: "BS1 4DJ", country: "UK" }) },
    ],
    tagNames: ["friend", "climbing"],
  });
  const ben = await call<Created>("/contacts", {
    kind: "person",
    firstName: "Ben",
    lastName: "Hartley",
    birthday: "1986-11-02",
    methods: [{ type: "email", label: "work", value: "ben.hartley@example.com", isPrimary: true }],
    tagNames: ["friend"],
    customFields: { coffee: "flat white", "football team": "Bristol City" },
  });
  const rex = await call<Created>("/contacts", { kind: "pet", firstName: "Rex", birthday: "--06-10", notes: "Golden retriever, 4 years old. Scared of fireworks.", tagNames: ["dog"] });
  const mum = await call<Created>("/contacts", {
    kind: "person",
    firstName: "Margaret",
    lastName: "Burr",
    nickname: "Mum",
    birthday: "1958-03-21",
    methods: [{ type: "phone", label: "home", value: "+44 117 496 0123", isPrimary: true }],
    tagNames: ["family"],
  });
  const priya = await call<Created>("/contacts", {
    kind: "person",
    firstName: "Priya",
    lastName: "Nair",
    methods: [
      { type: "email", label: "work", value: "priya.nair@acme.example", isPrimary: true },
      { type: "social", label: "linkedin", value: "https://linkedin.com/in/priyanair" },
    ],
    tagNames: ["work"],
  });
  const acme = await call<Created>("/contacts", {
    kind: "organization",
    firstName: "Acme Ltd",
    methods: [{ type: "url", label: "website", value: "https://acme.example" }],
    tagNames: ["work"],
  });
  const vet = await call<Created>("/contacts", {
    kind: "organization",
    firstName: "Clifton Veterinary Clinic",
    methods: [{ type: "phone", label: "reception", value: "+44 117 973 0000", isPrimary: true }],
    tagNames: ["services"],
  });

  await call("/relationships", { fromContactId: alice.id, toContactId: ben.id, typeKey: "spouse" });
  await call("/relationships", { fromContactId: alice.id, toContactId: rex.id, typeKey: "owner" });
  await call("/relationships", { fromContactId: ben.id, toContactId: rex.id, typeKey: "owner" });
  await call("/relationships", { fromContactId: mum.id, toContactId: alice.id, typeKey: "friend", label: "book club" });
  await call("/relationships", { fromContactId: priya.id, toContactId: acme.id, typeKey: "member", label: "Head of Engineering" });
  await call("/relationships", { fromContactId: vet.id, toContactId: rex.id, typeKey: "vet" });

  await call("/interactions", {
    type: "meal",
    occurredAt: daysAgo(3, 19),
    summary: "Dinner at Alice and Ben's",
    body: "Talked about their **Portugal trip** in October. Ben is thinking about changing jobs.\n\nBring a board game next time.",
    location: "12 Elm Street",
    contactIds: [alice.id, ben.id],
  });
  await call("/interactions", {
    type: "call",
    occurredAt: daysAgo(1, 10),
    summary: "Sunday call with Mum",
    body: "Her knee is better. Reminded me about Uncle Pete's 70th in November.",
    contactIds: [mum.id],
  });
  await call("/interactions", {
    type: "text",
    occurredAt: daysAgo(12, 9),
    summary: "Asked Alice about the climbing comp",
    contactIds: [alice.id],
  });
  await call("/interactions", {
    type: "meeting",
    occurredAt: daysAgo(20, 14),
    summary: "Coffee with Priya about the Acme contract",
    body: "They want a proposal by end of month.",
    location: "Small Street Espresso",
    contactIds: [priya.id],
  });
  await call("/interactions", {
    type: "event",
    occurredAt: daysAgo(45, 11),
    summary: "Rex's annual check-up",
    body: "All clear. Next booster due in 12 months.",
    contactIds: [rex.id, vet.id],
  });

  return c.json({ ok: true, contacts: [alice.id, ben.id, rex.id, mum.id, priya.id, acme.id, vet.id] });
});

export default app;
