import type { FileOut } from "@shared/types";
import type { FileRow } from "../db/schema";
import { ApiError } from "../lib/errors";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
/** The uncropped source photo kept alongside a cropped avatar. */
export const AVATAR_ORIGINAL_MAX_BYTES = 25 * 1024 * 1024;

export function toFileOut(row: FileRow): FileOut {
  return {
    id: row.id,
    kind: row.kind,
    contactId: row.contactId,
    interactionId: row.interactionId,
    filename: row.filename,
    contentType: row.contentType,
    size: row.size,
    url: `/api/files/${row.id}`,
    createdAt: row.createdAt,
  };
}

/** Reject oversized uploads before buffering the multipart body. */
export function assertContentLength(req: Request, max: number) {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > max) throw ApiError.tooLarge(`Upload exceeds ${Math.round(max / 1024 / 1024)} MB limit`);
}

export function isFile(v: unknown): v is File {
  return typeof v === "object" && v !== null && typeof (v as File).arrayBuffer === "function" && typeof (v as File).name === "string";
}

export async function readFiles(req: Request, field = "file"): Promise<File[]> {
  const form = await req.formData();
  const out: File[] = [];
  for (const entry of form.getAll(field)) {
    if (isFile(entry)) out.push(entry);
  }
  return out;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\w.\- ()]/g, "_").slice(0, 200) || "file";
}

export async function deleteObjects(bucket: R2Bucket, keys: string[]) {
  if (keys.length === 0) return;
  await bucket.delete(keys);
}
