import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, ne, notInArray, or } from "drizzle-orm";
import { Hono } from "hono";
import {
  contactBulkSchema,
  contactCreateSchema,
  contactListQuerySchema,
  contactMethodInputSchema,
  contactMethodUpdateSchema,
  contactUpdateSchema,
  setTagsSchema,
} from "@shared/schemas/contact";
import { normalizeSocial } from "@shared/social";
import type { AppEnv } from "../env";
import { schema } from "../db";
import { chunk, runBatch, type Stmt } from "../lib/batch";
import { ApiError, validationHook } from "../lib/errors";
import { isAdmin } from "../lib/session";
import { requireAdmin } from "../middleware/auth";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";
import { activityInserts, diffChanges, event } from "../services/activity";
import { computeDisplayName, ensureTags, existingTags, getContactDetail, getContactRow, listContacts, toMethodOut } from "../services/contacts";
import { assertEmployer, employerSyncStatements } from "../services/employment";
import { deleteObjects } from "../services/files";

const { contacts, contactMethods, contactTags, files, interactions, interactionContacts } = schema;

const app = new Hono<AppEnv>();

/** "Introduced by" must be a different, existing contact. */
async function assertMetVia(db: AppEnv["Variables"]["db"], selfId: string, viaId: string | null | undefined) {
  if (!viaId) return;
  if (viaId === selfId) throw ApiError.badRequest("A contact cannot have introduced themselves");
  const row = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, viaId)).get();
  if (!row) throw ApiError.badRequest("metViaContactId does not exist");
}

/** Social methods store the platform key as the label and the canonical profile URL as the value. */
function socialFields(type: string, label: string | null | undefined, value: string): { label: string | null; value: string } {
  if (type !== "social") return { label: label ?? null, value };
  const n = normalizeSocial(label ?? null, value);
  return { label: n.platformKey, value: n.value };
}

app.get("/contacts", zValidator("query", contactListQuerySchema, validationHook), async (c) => {
  return c.json(await listContacts(c.get("db"), c.req.valid("query")));
});

app.post("/contacts", zValidator("json", contactCreateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const input = c.req.valid("json");
  const id = newId();
  const now = nowIso();
  const displayName = computeDisplayName(input.kind, input.firstName, input.lastName);
  const tagRows = await ensureTags(db, input.tagNames);
  await assertMetVia(db, id, input.metViaContactId);
  await assertEmployer(db, id, input.employerContactId);

  const stmts: Stmt[] = [
    db.insert(contacts).values({
      id,
      kind: input.kind,
      displayName,
      firstName: input.firstName,
      lastName: input.lastName ?? null,
      nickname: input.nickname ?? null,
      pronouns: input.pronouns ?? null,
      otherNames: input.otherNames ?? [],
      birthday: input.birthday ?? null,
      metOn: input.metOn ?? null,
      metWhere: input.metWhere ?? null,
      metHow: input.metHow ?? null,
      metViaContactId: input.metViaContactId ?? null,
      jobTitle: input.jobTitle ?? null,
      employerContactId: input.employerContactId ?? null,
      notes: input.notes ?? null,
      customFields: input.customFields ?? {},
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    }),
  ];
  if (input.methods.length > 0) {
    const seenPrimary = new Set<string>();
    const methodRows = input.methods.map((m, i) => {
      // Only the first "primary" per type wins.
      const isPrimary = m.isPrimary && !seenPrimary.has(m.type);
      if (isPrimary) seenPrimary.add(m.type);
      const sf = socialFields(m.type, m.label, m.value);
      return {
        id: newId(),
        contactId: id,
        type: m.type,
        label: sf.label,
        value: sf.value,
        isPrimary,
        sortOrder: m.sortOrder ?? i,
        createdAt: now,
        updatedAt: now,
      };
    });
    // 9 columns per row: stay under D1's 100 bound parameters per statement.
    for (const part of chunk(methodRows, 11)) stmts.push(db.insert(contactMethods).values(part));
  }
  if (tagRows.length > 0) {
    for (const part of chunk(tagRows, 33)) stmts.push(db.insert(contactTags).values(part.map((t) => ({ contactId: id, tagId: t.id, createdAt: now }))));
  }
  stmts.push(
    ...activityInserts(db, [event(id, "contact", id, "contact.created", { v: 1, kind: input.kind, displayName })], c.get("actor")),
  );
  await runBatch(db, stmts);
  if (input.employerContactId) {
    await runBatch(db, await employerSyncStatements(db, id, null, input.employerContactId, c.get("actor")));
  }
  return c.json(await getContactDetail(db, id), 201);
});

app.get("/contacts/:id", async (c) => {
  return c.json(await getContactDetail(c.get("db"), c.req.param("id")));
});

app.patch("/contacts/:id", zValidator("json", contactUpdateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const patch = c.req.valid("json");
  const before = await getContactRow(db, id);

  const changes = diffChanges(
    {
      kind: before.kind,
      firstName: before.firstName,
      lastName: before.lastName,
      nickname: before.nickname,
      pronouns: before.pronouns,
      otherNames: before.otherNames,
      birthday: before.birthday,
      metOn: before.metOn,
      metWhere: before.metWhere,
      metHow: before.metHow,
      metViaContactId: before.metViaContactId,
      jobTitle: before.jobTitle,
      employerContactId: before.employerContactId,
      notes: before.notes,
      customFields: before.customFields,
    },
    patch,
  );
  if (Object.keys(changes).length === 0) {
    return c.json(await getContactDetail(db, id));
  }
  if (patch.metViaContactId !== undefined) await assertMetVia(db, id, patch.metViaContactId);
  if (patch.employerContactId !== undefined) await assertEmployer(db, id, patch.employerContactId);
  const employerAfter = patch.employerContactId === undefined ? before.employerContactId : patch.employerContactId;
  const employerStmts = await employerSyncStatements(db, id, before.employerContactId, employerAfter, c.get("actor"));
  const kind = patch.kind ?? before.kind;
  const firstName = patch.firstName ?? before.firstName;
  const lastName = patch.lastName === undefined ? before.lastName : patch.lastName;
  const now = nowIso();
  await runBatch(db, [
    db
      .update(contacts)
      .set({
        kind,
        firstName,
        lastName,
        displayName: computeDisplayName(kind, firstName, lastName),
        nickname: patch.nickname === undefined ? before.nickname : patch.nickname,
        pronouns: patch.pronouns === undefined ? before.pronouns : patch.pronouns,
        otherNames: patch.otherNames === undefined ? before.otherNames : patch.otherNames,
        birthday: patch.birthday === undefined ? before.birthday : patch.birthday,
        metOn: patch.metOn === undefined ? before.metOn : patch.metOn,
        metWhere: patch.metWhere === undefined ? before.metWhere : patch.metWhere,
        metHow: patch.metHow === undefined ? before.metHow : patch.metHow,
        metViaContactId: patch.metViaContactId === undefined ? before.metViaContactId : patch.metViaContactId,
        jobTitle: patch.jobTitle === undefined ? before.jobTitle : patch.jobTitle,
        employerContactId: employerAfter,
        notes: patch.notes === undefined ? before.notes : patch.notes,
        customFields: patch.customFields === undefined ? before.customFields : patch.customFields,
        updatedAt: now,
      })
      .where(eq(contacts.id, id)),
    ...activityInserts(db, [event(id, "contact", id, "contact.updated", { v: 1, changes })], c.get("actor")),
    ...employerStmts,
  ]);
  return c.json(await getContactDetail(db, id));
});

app.post("/contacts/:id/archive", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const row = await getContactRow(db, id);
  if (!row.archivedAt) {
    const now = nowIso();
    await runBatch(db, [
      db.update(contacts).set({ archivedAt: now, updatedAt: now }).where(eq(contacts.id, id)),
      ...activityInserts(db, [event(id, "contact", id, "contact.archived", { v: 1 })], c.get("actor")),
    ]);
  }
  return c.json(await getContactDetail(db, id));
});

app.post("/contacts/:id/unarchive", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const row = await getContactRow(db, id);
  if (row.archivedAt) {
    await runBatch(db, [
      db.update(contacts).set({ archivedAt: null, updatedAt: nowIso() }).where(eq(contacts.id, id)),
      ...activityInserts(db, [event(id, "contact", id, "contact.unarchived", { v: 1 })], c.get("actor")),
    ]);
  }
  return c.json(await getContactDetail(db, id));
});

/** Hard delete: the contact, its files in R2, and interactions that would be left with no participants. */
async function deleteContactCascade(db: AppEnv["Variables"]["db"], bucket: R2Bucket, id: string) {
  // Interactions whose only participant is this contact would be orphaned; remove them too.
  const orphanRows = await db
    .select({ interactionId: interactionContacts.interactionId })
    .from(interactionContacts)
    .where(
      and(
        eq(interactionContacts.contactId, id),
        notInArray(
          interactionContacts.interactionId,
          db.select({ i: interactionContacts.interactionId }).from(interactionContacts).where(ne(interactionContacts.contactId, id)),
        ),
      ),
    );
  const orphanIds = orphanRows.map((r) => r.interactionId);

  const fileRows = await db
    .select({ r2Key: files.r2Key })
    .from(files)
    .where(orphanIds.length > 0 ? or(eq(files.contactId, id), inArray(files.interactionId, orphanIds)) : eq(files.contactId, id));
  const stmts: Stmt[] = [];
  for (const part of chunk(orphanIds)) stmts.push(db.delete(interactions).where(inArray(interactions.id, part)));
  // Anyone this contact introduced keeps their record; the link is just cleared.
  stmts.push(db.update(contacts).set({ metViaContactId: null }).where(eq(contacts.metViaContactId, id)));
  stmts.push(db.delete(contacts).where(eq(contacts.id, id)));
  await runBatch(db, stmts);
  // Objects go last: an orphaned object is cheaper than a row pointing at nothing.
  await deleteObjects(
    bucket,
    fileRows.map((f) => f.r2Key),
  );
}

app.delete("/contacts/:id", requireAdmin, async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await getContactRow(db, id);
  await deleteContactCascade(db, c.env.BUCKET, id);
  return c.body(null, 204);
});

/** One action over many contacts. Tag and archive changes are logged per contact like their single-contact equivalents. */
app.post("/contacts/bulk", zValidator("json", contactBulkSchema, validationHook), async (c) => {
  const db = c.get("db");
  const { action, tagNames } = c.req.valid("json");
  const requested = [...new Set(c.req.valid("json").ids)];
  const actor = c.get("actor");

  const rows: { id: string; archivedAt: string | null }[] = [];
  for (const part of chunk(requested)) {
    rows.push(...(await db.select({ id: contacts.id, archivedAt: contacts.archivedAt }).from(contacts).where(inArray(contacts.id, part))));
  }
  const now = nowIso();

  if (action === "delete") {
    if (!isAdmin(c.get("user"))) throw ApiError.forbidden();
    for (const r of rows) await deleteContactCascade(db, c.env.BUCKET, r.id);
    return c.json({ updated: rows.length });
  }

  if (action === "archive" || action === "unarchive") {
    const targets = rows.filter((r) => (action === "archive" ? !r.archivedAt : !!r.archivedAt)).map((r) => r.id);
    const stmts: Stmt[] = [];
    for (const part of chunk(targets)) {
      stmts.push(
        db
          .update(contacts)
          .set({ archivedAt: action === "archive" ? now : null, updatedAt: now })
          .where(inArray(contacts.id, part)),
      );
    }
    stmts.push(
      ...activityInserts(
        db,
        targets.map((id) => event(id, "contact", id, action === "archive" ? "contact.archived" : "contact.unarchived", { v: 1 })),
        actor,
      ),
    );
    await runBatch(db, stmts);
    return c.json({ updated: targets.length });
  }

  // addTags / removeTags
  const tagRows = action === "addTags" ? await ensureTags(db, tagNames) : await existingTags(db, tagNames);
  if (tagRows.length === 0) return c.json({ updated: 0 });
  const tagIds = tagRows.map((t) => t.id);
  const ids = rows.map((r) => r.id);
  const current = new Set<string>();
  for (const part of chunk(ids)) {
    const pairs = await db
      .select({ contactId: contactTags.contactId, tagId: contactTags.tagId })
      .from(contactTags)
      .where(and(inArray(contactTags.contactId, part), inArray(contactTags.tagId, tagIds)));
    for (const p of pairs) current.add(`${p.contactId}|${p.tagId}`);
  }

  const stmts: Stmt[] = [];
  const touched = new Set<string>();
  if (action === "addTags") {
    const inserts = ids.flatMap((id) => tagRows.filter((t) => !current.has(`${id}|${t.id}`)).map((t) => ({ contactId: id, tagId: t.id, createdAt: now })));
    for (const part of chunk(inserts, 30)) stmts.push(db.insert(contactTags).values(part));
    for (const i of inserts) touched.add(i.contactId);
    stmts.push(
      ...activityInserts(
        db,
        inserts.map((i) => event(i.contactId, "tag", i.tagId, "tag.added", { v: 1, name: tagRows.find((t) => t.id === i.tagId)!.name })),
        actor,
      ),
    );
  } else {
    const removals = ids.flatMap((id) => tagRows.filter((t) => current.has(`${id}|${t.id}`)).map((t) => ({ contactId: id, tagId: t.id })));
    for (const r of removals) touched.add(r.contactId);
    for (const part of chunk([...touched])) {
      stmts.push(db.delete(contactTags).where(and(inArray(contactTags.contactId, part), inArray(contactTags.tagId, tagIds))));
    }
    stmts.push(
      ...activityInserts(
        db,
        removals.map((r) => event(r.contactId, "tag", r.tagId, "tag.removed", { v: 1, name: tagRows.find((t) => t.id === r.tagId)!.name })),
        actor,
      ),
    );
  }
  for (const part of chunk([...touched])) stmts.push(db.update(contacts).set({ updatedAt: now }).where(inArray(contacts.id, part)));
  await runBatch(db, stmts);
  return c.json({ updated: touched.size });
});

app.put("/contacts/:id/tags", zValidator("json", setTagsSchema, validationHook), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await getContactRow(db, id);
  const wanted = await ensureTags(db, c.req.valid("json").tagNames);
  const current = await db
    .select({ tagId: contactTags.tagId, name: schema.tags.name })
    .from(contactTags)
    .innerJoin(schema.tags, eq(schema.tags.id, contactTags.tagId))
    .where(eq(contactTags.contactId, id));
  const currentIds = new Set(current.map((t) => t.tagId));
  const wantedIds = new Set(wanted.map((t) => t.id));
  const toAdd = wanted.filter((t) => !currentIds.has(t.id));
  const toRemove = current.filter((t) => !wantedIds.has(t.tagId));
  if (toAdd.length === 0 && toRemove.length === 0) return c.json(await getContactDetail(db, id));

  const now = nowIso();
  const stmts: Stmt[] = [];
  for (const part of chunk(toAdd, 33)) stmts.push(db.insert(contactTags).values(part.map((t) => ({ contactId: id, tagId: t.id, createdAt: now }))));
  if (toRemove.length > 0) {
    stmts.push(
      db.delete(contactTags).where(
        and(
          eq(contactTags.contactId, id),
          inArray(
            contactTags.tagId,
            toRemove.map((t) => t.tagId),
          ),
        ),
      ),
    );
  }
  stmts.push(db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, id)));
  stmts.push(
    ...activityInserts(
      db,
      [
        ...toAdd.map((t) => event(id, "tag", t.id, "tag.added", { v: 1, name: t.name })),
        ...toRemove.map((t) => event(id, "tag", t.tagId, "tag.removed", { v: 1, name: t.name })),
      ],
      c.get("actor"),
    ),
  );
  await runBatch(db, stmts);
  return c.json(await getContactDetail(db, id));
});

// ---- Contact methods ------------------------------------------------------

app.get("/contacts/:id/methods", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await getContactRow(db, id);
  const rows = await db.select().from(contactMethods).where(eq(contactMethods.contactId, id)).orderBy(contactMethods.sortOrder, contactMethods.createdAt);
  return c.json({ items: rows.map(toMethodOut), total: rows.length });
});

app.post("/contacts/:id/methods", zValidator("json", contactMethodInputSchema, validationHook), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await getContactRow(db, id);
  const input = { ...c.req.valid("json") };
  Object.assign(input, socialFields(input.type, input.label, input.value));
  const methodId = newId();
  const now = nowIso();
  const stmts: Stmt[] = [];
  if (input.isPrimary) {
    stmts.push(
      db
        .update(contactMethods)
        .set({ isPrimary: false, updatedAt: now })
        .where(and(eq(contactMethods.contactId, id), eq(contactMethods.type, input.type))),
    );
  }
  stmts.push(
    db.insert(contactMethods).values({
      id: methodId,
      contactId: id,
      type: input.type,
      label: input.label ?? null,
      value: input.value,
      isPrimary: input.isPrimary,
      sortOrder: input.sortOrder,
      createdAt: now,
      updatedAt: now,
    }),
    db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, id)),
    ...activityInserts(
      db,
      [event(id, "contact_method", methodId, "contact_method.added", { v: 1, type: input.type, label: input.label ?? null, value: input.value })],
      c.get("actor"),
    ),
  );
  await runBatch(db, stmts);
  const row = await db.select().from(contactMethods).where(eq(contactMethods.id, methodId)).get();
  return c.json(toMethodOut(row!), 201);
});

app.patch("/contacts/:id/methods/:methodId", zValidator("json", contactMethodUpdateSchema, validationHook), async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const methodId = c.req.param("methodId");
  const before = await db
    .select()
    .from(contactMethods)
    .where(and(eq(contactMethods.id, methodId), eq(contactMethods.contactId, id)))
    .get();
  if (!before) throw ApiError.notFound("Contact method");
  const patch = c.req.valid("json");
  const changes = diffChanges(
    { type: before.type, label: before.label, value: before.value, isPrimary: before.isPrimary, sortOrder: before.sortOrder },
    patch,
  );
  if (Object.keys(changes).length === 0) return c.json(toMethodOut(before));
  const now = nowIso();
  const type = patch.type ?? before.type;
  const isPrimary = patch.isPrimary ?? before.isPrimary;
  if (type === "social") {
    const sf = socialFields(type, patch.label === undefined ? before.label : patch.label, patch.value ?? before.value);
    patch.label = sf.label;
    patch.value = sf.value;
  }
  const stmts: Stmt[] = [];
  if (isPrimary) {
    stmts.push(
      db
        .update(contactMethods)
        .set({ isPrimary: false, updatedAt: now })
        .where(and(eq(contactMethods.contactId, id), eq(contactMethods.type, type), ne(contactMethods.id, methodId))),
    );
  }
  stmts.push(
    db
      .update(contactMethods)
      .set({
        type,
        label: patch.label === undefined ? before.label : patch.label,
        value: patch.value ?? before.value,
        isPrimary,
        sortOrder: patch.sortOrder ?? before.sortOrder,
        updatedAt: now,
      })
      .where(eq(contactMethods.id, methodId)),
    db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, id)),
    ...activityInserts(db, [event(id, "contact_method", methodId, "contact_method.updated", { v: 1, type, changes })], c.get("actor")),
  );
  await runBatch(db, stmts);
  const row = await db.select().from(contactMethods).where(eq(contactMethods.id, methodId)).get();
  return c.json(toMethodOut(row!));
});

app.delete("/contacts/:id/methods/:methodId", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const methodId = c.req.param("methodId");
  const before = await db
    .select()
    .from(contactMethods)
    .where(and(eq(contactMethods.id, methodId), eq(contactMethods.contactId, id)))
    .get();
  if (!before) throw ApiError.notFound("Contact method");
  const now = nowIso();
  await runBatch(db, [
    db.delete(contactMethods).where(eq(contactMethods.id, methodId)),
    db.update(contacts).set({ updatedAt: now }).where(eq(contacts.id, id)),
    ...activityInserts(
      db,
      [event(id, "contact_method", methodId, "contact_method.removed", { v: 1, type: before.type, label: before.label, value: before.value })],
      c.get("actor"),
    ),
  ]);
  return c.body(null, 204);
});

export default app;
