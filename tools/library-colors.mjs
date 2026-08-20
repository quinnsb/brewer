/* ============================================================
   LIBRARY COLORS — post-process pass over data/library.json

   Run after library-sync.mjs:  node tools/library-colors.mjs

   Adds to every item:
     width, height     true pixel dimensions of the cached cover
     palette.cover     muted mean, used as the spine / sleeve ground
     palette.accent    most vibrant sample, used for foil + rules
     palette.ink       black or cream, whichever clears contrast on `cover`

   Uses macOS `sips` to downsample each cover to an 8x8 BMP and reads the
   64 pixels directly. BMP is used because it is uncompressed and trivially
   parseable, so this needs no image-decoding dependency.
   ============================================================ */

import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data", "library.json");
const GRID = 8;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");

/* WCAG relative luminance, used to pick a legible ink colour. */
function luminance(r, g, b) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

async function samplePixels(file) {
  const dir = await mkdtemp(path.join(tmpdir(), "libcolor-"));
  const out = path.join(dir, "s.bmp");
  try {
    await run("sips", ["-z", String(GRID), String(GRID), "-s", "format", "bmp", file, "--out", out]);
    const buf = await readFile(out);
    const offset = buf.readUInt32LE(10);
    const bpp = buf.readUInt16LE(28);
    const bytes = bpp / 8;
    const rowSize = Math.floor((bpp * GRID + 31) / 32) * 4;
    const px = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = offset + y * rowSize + x * bytes;
        /* BMP stores BGR */
        px.push([buf[i + 2], buf[i + 1], buf[i]]);
      }
    }
    return px;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function derivePalette(px) {
  const n = px.length;
  const mean = px.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n, a[2] + p[2] / n], [0, 0, 0]);

  /* Vibrant = highest saturation among pixels that are not near-black or
     near-white, since those carry no usable hue. */
  let best = null, bestScore = -1;
  for (const p of px) {
    const [, s, l] = rgbToHsl(...p);
    if (l < 0.12 || l > 0.93) continue;
    const score = s * (1 - Math.abs(l - 0.5));
    if (score > bestScore) { bestScore = score; best = p; }
  }
  const accent = best ?? mean;

  /* Darken the mean so spine type has somewhere to sit. */
  const cover = mean.map((c) => c * 0.72);
  const lum = luminance(...cover);
  const ink = contrast(lum, luminance(241, 236, 227)) >= contrast(lum, luminance(20, 18, 16))
    ? "#f1ece3"   /* site cream */
    : "#141210";

  return { cover: hex(...cover), accent: hex(...accent), ink };
}

async function main() {
  const db = JSON.parse(await readFile(DATA, "utf8"));
  for (const item of db.items) {
    const file = path.join(ROOT, item.cover);
    try {
      const [{ stdout }, px] = await Promise.all([
        run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]),
        samplePixels(file),
      ]);
      item.width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1] ?? 0);
      item.height_px = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1] ?? 0);
      item.palette = derivePalette(px);
      console.log(`  ${item.id.padEnd(46)} ${item.width}x${item.height_px}  ${item.palette.cover} / ${item.palette.accent}`);
    } catch (err) {
      console.log(`  MISS ${item.id}: ${err.message}`);
      item.palette = { cover: "#33302b", accent: "#7a736a", ink: "#f1ece3" };
    }
  }
  await writeFile(DATA, JSON.stringify(db, null, 2));
  console.log(`\npalettes written for ${db.items.length} items`);
}

main().catch((e) => { console.error(e); process.exit(1); });
