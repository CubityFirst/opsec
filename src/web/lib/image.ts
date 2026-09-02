import { ASK_IMAGE_MAX_BYTES, ASK_IMAGE_MAX_EDGE, type AskImage } from "@shared/schemas/ask";

export interface PreparedImage extends AskImage {
  previewUrl: string;
  width: number;
  height: number;
}

/**
 * Downscale to ≤ ASK_IMAGE_MAX_EDGE on the long edge and re-encode as WebP
 * (PNG if the browser cannot encode WebP), then base64 it for the request.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Not an image");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, ASK_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob = await toBlob(canvas, "image/webp", 0.9);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/png");
  if (!blob) throw new Error("Could not encode the image");
  if (blob.size > ASK_IMAGE_MAX_BYTES) throw new Error("Image is too large after resizing (5 MB max)");

  const data = await toBase64(blob);
  return { mediaType: blob.type as AskImage["mediaType"], data, previewUrl: URL.createObjectURL(blob), width, height };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(blob);
  });
}
