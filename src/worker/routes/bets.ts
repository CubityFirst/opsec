import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { betCreateSchema, betListQuerySchema, betSettleSchema, betUpdateSchema } from "@shared/schemas/bet";
import type { BetListResult } from "@shared/types";
import { schema } from "../db";
import type { BetRow } from "../db/schema";
import type { AppEnv } from "../env";
import { runBatch } from "../lib/batch";
import { ApiError, validationHook } from "../lib/errors";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";
import { activityInserts, diffChanges, event } from "../services/activity";
import { getBetOut, getBetRow, listBets, todayIso } from "../services/bets";
import { getContactRow } from "../services/contacts";

const { bets, contacts } = schema;

const app = new Hono<AppEnv>();

/** All bets, open first; `?status=open|settled`, `?dueBy=YYYY-MM-DD` for review points that have arrived. */
app.get("/bets", zValidator("query", betListQuerySchema, validationHook), async (c) => {
  const result: BetListResult = await listBets(c.get("db"), c.req.valid("query"));
  return c.json(result);
});

app.get("/contacts/:id/bets", zValidator("query", betListQuerySchema, validationHook), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await getContactRow(db, id);
  const result: BetListResult = await listBets(db, c.req.valid("query"), { contactId: id });
  return c.json(result);
});

app.post("/contacts/:id/bets", zValidator("json", betCreateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const contactId = c.req.param("id");
  await getContactRow(db, contactId);
  const input = c.req.valid("json");
  const now = nowIso();
  const madeOn = input.madeOn ?? todayIso();
  if (input.reviewOn < madeOn) throw ApiError.badRequest("The review date must not be before the day the bet was made");
  const row: BetRow = {
    id: newId(),
    contactId,
    prediction: input.prediction,
    wager: input.wager ?? null,
    madeOn,
    reviewOn: input.reviewOn,
    details: input.details ?? null,
    outcome: null,
    settledAt: null,
    settledNote: null,
    createdAt: now,
    updatedAt: now,
  };
  await runBatch(db, [
    db.insert(bets).values(row),
    db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, contactId)),
    ...activityInserts(
      db,
      [event(contactId, "bet", row.id, "bet.created", { v: 1, prediction: row.prediction, wager: row.wager, madeOn: row.madeOn, reviewOn: row.reviewOn })],
      c.get("actor"),
    ),
  ]);
  return c.json(await getBetOut(db, row.id), 201);
});

app.get("/bets/:id", async (c) => c.json(await getBetOut(c.get("db"), c.req.param("id"))));

app.patch("/bets/:id", zValidator("json", betUpdateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const before = await getBetRow(db, c.req.param("id"));
  const patch = c.req.valid("json");
  const changes = diffChanges({ prediction: before.prediction, wager: before.wager, madeOn: before.madeOn, reviewOn: before.reviewOn, details: before.details }, patch);
  if (Object.keys(changes).length === 0) return c.json(await getBetOut(db, before.id));
  const next = {
    prediction: patch.prediction ?? before.prediction,
    wager: patch.wager === undefined ? before.wager : patch.wager,
    madeOn: patch.madeOn ?? before.madeOn,
    reviewOn: patch.reviewOn ?? before.reviewOn,
    details: patch.details === undefined ? before.details : patch.details,
  };
  if (next.reviewOn < next.madeOn) throw ApiError.badRequest("The review date must not be before the day the bet was made");
  const now = nowIso();
  await runBatch(db, [
    db
      .update(bets)
      .set({ ...next, updatedAt: now })
      .where(eq(bets.id, before.id)),
    db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, before.contactId)),
    ...activityInserts(db, [event(before.contactId, "bet", before.id, "bet.updated", { v: 1, prediction: next.prediction, changes })], c.get("actor")),
  ]);
  return c.json(await getBetOut(db, before.id));
});

/** Record which way it fell. Re-settling an already settled bet replaces the outcome. */
app.post("/bets/:id/settle", zValidator("json", betSettleSchema, validationHook), async (c) => {
  const db = c.get("db");
  const before = await getBetRow(db, c.req.param("id"));
  const input = c.req.valid("json");
  const now = nowIso();
  await runBatch(db, [
    db.update(bets).set({ outcome: input.outcome, settledNote: input.note ?? null, settledAt: now, updatedAt: now }).where(eq(bets.id, before.id)),
    db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, before.contactId)),
    ...activityInserts(
      db,
      [event(before.contactId, "bet", before.id, "bet.settled", { v: 1, prediction: before.prediction, wager: before.wager, outcome: input.outcome, note: input.note ?? null })],
      c.get("actor"),
    ),
  ]);
  return c.json(await getBetOut(db, before.id));
});

/** Undo a settlement: the bet goes back to open with its review date unchanged. */
app.post("/bets/:id/reopen", async (c) => {
  const db = c.get("db");
  const before = await getBetRow(db, c.req.param("id"));
  if (!before.outcome) throw ApiError.conflict("This bet is still open");
  const now = nowIso();
  await runBatch(db, [
    db.update(bets).set({ outcome: null, settledNote: null, settledAt: null, updatedAt: now }).where(eq(bets.id, before.id)),
    db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, before.contactId)),
    ...activityInserts(db, [event(before.contactId, "bet", before.id, "bet.reopened", { v: 1, prediction: before.prediction, previousOutcome: before.outcome })], c.get("actor")),
  ]);
  return c.json(await getBetOut(db, before.id));
});

app.delete("/bets/:id", async (c) => {
  const db = c.get("db");
  const before = await getBetRow(db, c.req.param("id"));
  await runBatch(db, [
    db.delete(bets).where(eq(bets.id, before.id)),
    ...activityInserts(
      db,
      [event(before.contactId, "bet", before.id, "bet.deleted", { v: 1, prediction: before.prediction, wager: before.wager, reviewOn: before.reviewOn, outcome: before.outcome })],
      c.get("actor"),
    ),
  ]);
  return c.body(null, 204);
});

export default app;
