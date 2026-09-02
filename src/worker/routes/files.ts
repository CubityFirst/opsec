import { desc, eq, inArray, or } from "drizzle-orm";
import { Hono } from "hono";
import type { FileOut } from "@shared/types";
import { schema } from "../db";
import type { FileRow } from "../db/schema";
import type { AppEnv } from "../env";
import { runBatch, type Stmt } from "../lib/batch";
import { ApiError } from "../lib/errors";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";
import { activityInserts, event } from "../services/activity";
import { getContactRow } from "../services/contacts";
import {
  ATTACHMENT_MAX_BYTES,
  AVATAR_MAX_BYTES,
  AVATAR_ORIGINAL_MAX_BYTES,
  assertContentLength,
  deleteObjects,
  isFile,
  readFiles,
  sanitizeFilename,
  toFileOut,
} from "../services/files";
import { getInteractionRow, participantIds } from "../services/interactions";

const { contacts, files, interactionContacts } = schema;

const app = new Hono<AppEnv>();

async function getFileRow(db: AppEnv["Variables"]["db"], id: string): Promise<FileRow> {
  const row = await db.select().from(files).where(eq(files.id, id)).get();
  if (!row) throw ApiError.notFound("File");
  return row;
}

/** Rows currently referenced by a contact's avatar fields (cropped + original). */
async function currentAvatarRows(db: AppEnv["Variables"]["db"], contact: { avatarFileId: string | null; avatarOriginalFileId: string | null }) {
  const ids = [contact.avatarFileId, contact.avatarOriginalFileId].filter((x): x is string => !!x);
  if (ids.length === 0) return [] as FileRow[];
  return db.select().from(files).where(inArray(files.id, ids));
}

function requireImage(file: File, what: string, max: number): string {
  if (file.size > max) throw ApiError.tooLarge(`${what} exceeds ${Math.round(max / 1024 / 1024)} MB limit`);
  const contentType = file.type || "application/octet-stream";
  if (!contentType.startsWith("image/")) throw ApiError.badRequest(`${what} must be an image`);
  return contentType;
}

/**
 * Multipart fields: `file` = the cropped avatar that is displayed everywhere;
 * `original` (optional) = the untouched upload, kept so the full photo can be
 * viewed. Both replace whatever the contact had before.
 */
app.post("/contacts/:id/avatar", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const contact = await getContactRow(db, id);
  assertContentLength(c.req.raw, AVATAR_MAX_BYTES + AVATAR_ORIGINAL_MAX_BYTES + 64 * 1024);
  const form = await c.req.raw.formData();
  const cropped = form.get("file");
  const original = form.get("original");
  if (!isFile(cropped)) throw ApiError.badRequest('Expected a multipart "file" field');
  const croppedType = requireImage(cropped, "Avatar", AVATAR_MAX_BYTES);
  const originalType = isFile(original) ? requireImage(original, "Original photo", AVATAR_ORIGINAL_MAX_BYTES) : null;

  const now = nowIso();
  const avatarRow: FileRow = {
    id: newId(),
    kind: "avatar",
    contactId: id,
    interactionId: null,
    r2Key: "",
    filename: sanitizeFilename(cropped.name || "avatar.webp"),
    contentType: croppedType,
    size: cropped.size,
    sha256: null,
    createdAt: now,
    updatedAt: now,
  };
  avatarRow.r2Key = `avatars/${id}/${avatarRow.id}`;
  const originalRow: FileRow | null =
    isFile(original) && originalType
      ? {
          id: newId(),
          kind: "avatar_original",
          contactId: id,
          interactionId: null,
          r2Key: "",
          filename: sanitizeFilename(original.name || "photo"),
          contentType: originalType,
          size: original.size,
          sha256: null,
          createdAt: now,
          updatedAt: now,
        }
      : null;
  if (originalRow) originalRow.r2Key = `avatars/${id}/${originalRow.id}`;

  await c.env.BUCKET.put(avatarRow.r2Key, await cropped.arrayBuffer(), { httpMetadata: { contentType: croppedType } });
  if (originalRow && isFile(original)) {
    await c.env.BUCKET.put(originalRow.r2Key, await original.arrayBuffer(), { httpMetadata: { contentType: originalRow.contentType } });
  }

  const previous = await currentAvatarRows(db, contact);
  const rows = originalRow ? [avatarRow, originalRow] : [avatarRow];
  const stmts: Stmt[] = [
    db.insert(files).values(rows),
    db
      .update(contacts)
      .set({ avatarFileId: avatarRow.id, avatarOriginalFileId: originalRow?.id ?? null, updatedAt: now })
      .where(eq(contacts.id, id)),
    ...activityInserts(
      db,
      [event(id, "file", avatarRow.id, "file.uploaded", { v: 1, kind: "avatar", filename: avatarRow.filename, contentType: croppedType, size: cropped.size })],
      c.get("actor"),
    ),
  ];
  if (previous.length > 0) {
    stmts.push(
      db.delete(files).where(
        inArray(
          files.id,
          previous.map((p) => p.id),
        ),
      ),
    );
  }
  await runBatch(db, stmts);
  await deleteObjects(
    c.env.BUCKET,
    previous.map((p) => p.r2Key),
  );
  return c.json(toFileOut(avatarRow), 201);
});

app.delete("/contacts/:id/avatar", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const contact = await getContactRow(db, id);
  if (!contact.avatarFileId && !contact.avatarOriginalFileId) return c.body(null, 204);
  const rows = await currentAvatarRows(db, contact);
  const now = nowIso();
  const stmts: Stmt[] = [db.update(contacts).set({ avatarFileId: null, avatarOriginalFileId: null, updatedAt: now }).where(eq(contacts.id, id))];
  if (rows.length > 0) {
    stmts.push(
      db.delete(files).where(
        inArray(
          files.id,
          rows.map((r) => r.id),
        ),
      ),
    );
  }
  const avatar = rows.find((r) => r.kind === "avatar");
  if (avatar) {
    stmts.push(...activityInserts(db, [event(id, "file", avatar.id, "file.deleted", { v: 1, kind: "avatar", filename: avatar.filename })], c.get("actor")));
  }
  await runBatch(db, stmts);
  await deleteObjects(
    c.env.BUCKET,
    rows.map((r) => r.r2Key),
  );
  return c.body(null, 204);
});

app.post("/interactions/:id/files", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await getInteractionRow(db, id);
  assertContentLength(c.req.raw, ATTACHMENT_MAX_BYTES * 4);
  const uploads = await readFiles(c.req.raw);
  if (uploads.length === 0) throw ApiError.badRequest('Expected at least one multipart "file" field');
  for (const f of uploads) {
    if (f.size > ATTACHMENT_MAX_BYTES) throw ApiError.tooLarge(`"${f.name}" exceeds 25 MB limit`);
  }
  const participants = await participantIds(db, id);
  const now = nowIso();
  const rows: FileRow[] = [];
  for (const f of uploads) {
    const fileId = newId();
    const r2Key = `attachments/${id}/${fileId}`;
    const contentType = f.type || "application/octet-stream";
    await c.env.BUCKET.put(r2Key, await f.arrayBuffer(), { httpMetadata: { contentType } });
    rows.push({
      id: fileId,
      kind: "attachment",
      contactId: null,
      interactionId: id,
      r2Key,
      filename: sanitizeFilename(f.name || "attachment"),
      contentType,
      size: f.size,
      sha256: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  const stmts: Stmt[] = [db.insert(files).values(rows)];
  const events = participants.flatMap((contactId) =>
    rows.map((r) =>
      event(contactId, "file", r.id, "file.uploaded", { v: 1, kind: "attachment", filename: r.filename, contentType: r.contentType, size: r.size }),
    ),
  );
  if (events.length > 0) stmts.push(...activityInserts(db, events, c.get("actor")));
  await runBatch(db, stmts);
  const items: FileOut[] = rows.map(toFileOut);
  return c.json({ items, total: items.length }, 201);
});

app.get("/contacts/:id/files", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  await getContactRow(db, id);
  const rows = await db
    .select()
    .from(files)
    .where(
      or(
        eq(files.contactId, id),
        inArray(files.interactionId, db.select({ i: interactionContacts.interactionId }).from(interactionContacts).where(eq(interactionContacts.contactId, id))),
      ),
    )
    .orderBy(desc(files.createdAt));
  const items = rows.map(toFileOut);
  return c.json({ items, total: items.length });
});

app.get("/files/:id", async (c) => {
  const db = c.get("db");
  const row = await getFileRow(db, c.req.param("id"));
  const obj = await c.env.BUCKET.get(row.r2Key);
  if (!obj) throw ApiError.notFound("File content");
  const ifNoneMatch = c.req.header("if-none-match");
  if (ifNoneMatch && ifNoneMatch === obj.httpEtag) {
    return new Response(null, { status: 304, headers: { ETag: obj.httpEtag } });
  }
  const download = c.req.query("download") === "1";
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Content-Type", row.contentType);
  headers.set("Content-Length", String(obj.size));
  headers.set("ETag", obj.httpEtag);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${row.filename.replace(/"/g, "")}"`);
  return new Response(obj.body, { status: 200, headers });
});

app.delete("/files/:id", async (c) => {
  const db = c.get("db");
  const row = await getFileRow(db, c.req.param("id"));
  const now = nowIso();
  const stmts: Stmt[] = [db.delete(files).where(eq(files.id, row.id))];
  const affected: string[] = [];
  if (row.kind === "avatar" && row.contactId) {
    affected.push(row.contactId);
    stmts.push(db.update(contacts).set({ avatarFileId: null, updatedAt: now }).where(eq(contacts.id, row.contactId)));
  } else if (row.kind === "avatar_original" && row.contactId) {
    affected.push(row.contactId);
    stmts.push(db.update(contacts).set({ avatarOriginalFileId: null, updatedAt: now }).where(eq(contacts.id, row.contactId)));
  } else if (row.interactionId) {
    affected.push(...(await participantIds(db, row.interactionId)));
  }
  if (affected.length > 0) {
    stmts.push(
      ...activityInserts(
        db,
        affected.map((contactId) => event(contactId, "file", row.id, "file.deleted", { v: 1, kind: row.kind, filename: row.filename })),
        c.get("actor"),
      ),
    );
  }
  await runBatch(db, stmts);
  await deleteObjects(c.env.BUCKET, [row.r2Key]);
  return c.body(null, 204);
});

export default app;
