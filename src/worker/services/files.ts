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

/** Reject oversized (or unsized) uploads before buffering the multipart body. */
export function assertContentLength(req: Request, max: number) {
  const raw = req.headers.get("content-length");
  const len = raw === null ? Number.NaN : Number(raw);
  if (!Number.isFinite(len) || len < 0) throw ApiError.badRequest("Uploads must send a Content-Length header");
  if (len > max) throw ApiError.tooLarge(`Upload exceeds ${Math.round(max / 1024 / 1024)} MB limit`);
}

/** Types a browser may render inline on our origin. Everything else is served as a download. */
export const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);
export const RASTER_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Content type from magic bytes for the formats we allow inline; null for anything else. */
export function sniffType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  return null;
}

/** Types a browser would execute or render as a document: never stored or served as-is. */
export function isActiveType(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t.startsWith("text/html") ||
    t.startsWith("application/xhtml") ||
    t.startsWith("text/xml") ||
    t.startsWith("application/xml") ||
    t.startsWith("image/svg") ||
    t.endsWith("+xml") ||
    t.includes("javascript") ||
    t.includes("ecmascript") ||
    t.startsWith("text/vbscript")
  );
}

/**
 * The content type recorded for an upload: the sniffed type when the bytes are
 * a format we render inline, otherwise the declared type unless it is one a
 * browser could run (those become application/octet-stream).
 */
export function storedContentType(declared: string, bytes: Uint8Array): string {
  const sniffed = sniffType(bytes);
  if (sniffed) return sniffed;
  const d = (declared || "").toLowerCase().split(";")[0]!.trim();
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(d) || isActiveType(d)) return "application/octet-stream";
  return d;
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
