#!/usr/bin/env node
/**
 * Regenerates the PWA icons in `public/` (`npm run icons`).
 *
 * The mark is the wordmark's block cursor: a light bar and block on a near-black
 * tile, all axis-aligned rectangles, so it is drawn here from geometry rather
 * than rasterised from a font — no dependencies, identical output everywhere.
 * `public/favicon.svg` draws the same shapes in SVG; keep the two in step if you
 * move anything.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TILE = [10, 10, 10, 255]; // #0a0a0a, the dark theme's background
const MARK = [250, 250, 250, 255]; // #fafafa
const CORNER = 0.22; // tile corner radius, as a fraction of the icon's side
const NIB = 0.02; // corner radius of the mark's own rectangles

/** Unit-square geometry of the mark: the typed line, then the cursor block. */
const MARK_RECTS = [
  { x0: 0.24, y0: 0.64, x1: 0.48, y1: 0.7 },
  { x0: 0.54, y0: 0.3, x1: 0.76, y1: 0.7 },
];

const VARIANTS = [
  // `any` icons carry their own rounded corners; maskable and Apple ones are
  // full-bleed because the platform applies its own mask, and maskable keeps the
  // mark inside the central safe zone.
  { file: "icon-192.png", size: 192, corner: CORNER, scale: 1 },
  { file: "icon-512.png", size: 512, corner: CORNER, scale: 1 },
  { file: "icon-maskable-512.png", size: 512, corner: 0, scale: 0.72 },
  { file: "apple-touch-icon.png", size: 180, corner: 0, scale: 1 },
];

const SUPERSAMPLE = 4;

/** Distance test for a rounded rectangle in pixel units. */
function inside(x, y, { x0, y0, x1, y1, r }) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  if (!r) return true;
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return dx <= 0 || dy <= 0 || dx * dx + dy * dy <= r * r;
}

/** Coverage of a shape over one pixel, sampled on a SUPERSAMPLE² grid. */
function coverage(px, py, shape) {
  let hits = 0;
  for (let sy = 0; sy < SUPERSAMPLE; sy++) {
    for (let sx = 0; sx < SUPERSAMPLE; sx++) {
      if (inside(px + (sx + 0.5) / SUPERSAMPLE, py + (sy + 0.5) / SUPERSAMPLE, shape)) hits++;
    }
  }
  return hits / (SUPERSAMPLE * SUPERSAMPLE);
}

function blend(rgba, i, [r, g, b, a], alpha) {
  const k = (a / 255) * alpha;
  if (k <= 0) return;
  const inv = 1 - k;
  rgba[i] = Math.round(r * k + rgba[i] * inv);
  rgba[i + 1] = Math.round(g * k + rgba[i + 1] * inv);
  rgba[i + 2] = Math.round(b * k + rgba[i + 2] * inv);
  rgba[i + 3] = Math.round(255 * k + rgba[i + 3] * inv);
}

function render({ size, corner, scale }) {
  const rgba = new Uint8Array(size * size * 4);
  const tile = { x0: 0, y0: 0, x1: size, y1: size, r: corner * size };
  // Scale the mark about the centre so maskable variants stay in the safe zone.
  const marks = MARK_RECTS.map((m) => ({
    x0: (0.5 + (m.x0 - 0.5) * scale) * size,
    y0: (0.5 + (m.y0 - 0.5) * scale) * size,
    x1: (0.5 + (m.x1 - 0.5) * scale) * size,
    y1: (0.5 + (m.y1 - 0.5) * scale) * size,
    r: NIB * size * scale,
  }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      blend(rgba, i, TILE, coverage(x, y, tile));
      for (const m of marks) blend(rgba, i, MARK, coverage(x, y, m));
    }
  }
  return rgba;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** Minimal RGBA8 PNG: one IDAT of filter-0 scanlines. */
function png(rgba, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.subarray(y * size * 4, (y + 1) * size * 4)).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = fileURLToPath(new URL("../public/", import.meta.url));
mkdirSync(dir, { recursive: true });
for (const v of VARIANTS) {
  writeFileSync(dir + v.file, png(render(v), v.size));
  console.log(`${v.file}  ${v.size}×${v.size}`);
}
