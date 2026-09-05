import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { giftCreateSchema, giftGiveSchema, giftListQuerySchema, giftUpdateSchema } from "@shared/schemas/gift";
import type { GiftListResult } from "@shared/types";
import { schema } from "../db";
import type { GiftRow } from "../db/schema";
import type { AppEnv } from "../env";
import { runBatch } from "../lib/batch";
import { ApiError, validationHook } from "../lib/errors";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";
import { activityInserts, diffChanges, event } from "../services/activity";
import { todayIso } from "../services/bets";
import { getContactRow } from "../services/contacts";
import { getGiftOut, getGiftRow, listGifts } from "../services/gifts";

const { gifts, contacts } = schema;

const app = new Hono<AppEnv>();

/** All gifts, ideas first; `?status=idea|given|received`. */
app.get("/gifts", zValidator("query", giftListQuerySchema, validationHook), async (c) => {
  const result: GiftListResult = await listGifts(c.get("db"), c.req.valid("query"));
  return c.json(result);
});

app.get("/contacts/:id/gifts", zValidator("query", giftListQuerySchema, validationHook), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await getContactRow(db, id);
  const result: GiftListResult = await listGifts(db, c.req.valid("query"), { contactId: id });
  return c.json(result);
});

app.post("/contacts/:id/gifts", zValidator("json", giftCreateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const contactId = c.req.param("id");
  await getContactRow(db, contactId);
  const input = c.req.valid("json");
  const now = nowIso();
  const row: GiftRow = {
    id: newId(),
    contactId,
    name: input.name,
    status: input.status,
    occasion: input.occasion ?? null,
    givenOn: input.status === "idea" ? null : (input.givenOn ?? todayIso()),
    price: input.price ?? null,
    url: input.url ?? null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await runBatch(db, [
    db.insert(gifts).values(row),
    db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, contactId)),
    ...activityInserts(db, [event(contactId, "gift", row.id, "gift.created", { v: 1, name: row.name, status: row.status, occasion: row.occasion, givenOn: row.givenOn })], c.get("actor")),
  ]);
  return c.json(await getGiftOut(db, row.id), 201);
});

app.get("/gifts/:id", async (c) => c.json(await getGiftOut(c.get("db"), c.req.param("id"))));

/** Edit any field, including the status; moving to `idea` clears the date, moving out of it defaults the date to today. */
app.patch("/gifts/:id", zValidator("json", giftUpdateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const before = await getGiftRow(db, c.req.param("id"));
  const patch = c.req.valid("json");
  const status = patch.status ?? before.status;
  const givenOn = status === "idea" ? null : patch.givenOn === undefined ? (before.givenOn ?? todayIso()) : (patch.givenOn ?? todayIso());
  const next = {
    name: patch.name ?? before.name,
    status,
    occasion: patch.occasion === undefined ? before.occasion : patch.occasion,
    givenOn,
    price: patch.price === undefined ? before.price : patch.price,
    url: patch.url === undefined ? before.url : patch.url,
    notes: patch.notes === undefined ? before.notes : patch.notes,
  };
  const current = { name: before.name, status: before.status, occasion: before.occasion, givenOn: before.givenOn, price: before.price, url: before.url, notes: before.notes };
  const changes = diffChanges(current, next);
  if (Object.keys(changes).length === 0) return c.json(await getGiftOut(db, before.id));
  const now = nowIso();
  await runBatch(db, [
    db
      .update(gifts)
      .set({ ...next, updatedAt: now })
      .where(eq(gifts.id, before.id)),
    db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, before.contactId)),
    ...activityInserts(db, [event(before.contactId, "gift", before.id, "gift.updated", { v: 1, name: next.name, changes })], c.get("actor")),
  ]);
  return c.json(await getGiftOut(db, before.id));
});

/** An idea becomes a gift that has been given. */
app.post("/gifts/:id/give", zValidator("json", giftGiveSchema, validationHook), async (c) => {
  const db = c.get("db");
  const before = await getGiftRow(db, c.req.param("id"));
  if (before.status !== "idea") throw ApiError.conflict("This gift has already been given");
  const input = c.req.valid("json");
  const on = input.on ?? todayIso();
  const occasion = input.occasion === undefined ? before.occasion : input.occasion || null;
  const price = input.price === undefined ? before.price : input.price || null;
  const now = nowIso();
  await runBatch(db, [
    db.update(gifts).set({ status: "given", givenOn: on, occasion, price, updatedAt: now }).where(eq(gifts.id, before.id)),
    db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, before.contactId)),
    ...activityInserts(db, [event(before.contactId, "gift", before.id, "gift.given", { v: 1, name: before.name, occasion, on })], c.get("actor")),
  ]);
  return c.json(await getGiftOut(db, before.id));
});

/** Back to an idea: undo a give, or shelve a given / received gift. The date is cleared. */
app.post("/gifts/:id/revert", async (c) => {
  const db = c.get("db");
  const before = await getGiftRow(db, c.req.param("id"));
  if (before.status === "idea") throw ApiError.conflict("This gift is still an idea");
  const now = nowIso();
  await runBatch(db, [
    db.update(gifts).set({ status: "idea", givenOn: null, updatedAt: now }).where(eq(gifts.id, before.id)),
    db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, before.contactId)),
    ...activityInserts(db, [event(before.contactId, "gift", before.id, "gift.reverted", { v: 1, name: before.name, previousStatus: before.status })], c.get("actor")),
  ]);
  return c.json(await getGiftOut(db, before.id));
});

app.delete("/gifts/:id", async (c) => {
  const db = c.get("db");
  const before = await getGiftRow(db, c.req.param("id"));
  await runBatch(db, [
    db.delete(gifts).where(eq(gifts.id, before.id)),
    ...activityInserts(db, [event(before.contactId, "gift", before.id, "gift.deleted", { v: 1, name: before.name, status: before.status, occasion: before.occasion })], c.get("actor")),
  ]);
  return c.body(null, 204);
});

export default app;
