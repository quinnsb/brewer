/* The macOS half of the palette pass. Kept apart from palette.mjs so the
   colour logic can be tested without spawning a process.

   Covers are downsampled to an 8x8 BMP and read directly. BMP is used because
   it is uncompressed and trivially parseable, so this needs no image-decoding
   dependency. */

import { readFile, mkdtemp, rm, stat, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";

const run = promisify(execFile);
const GRID = 8;

function decodeBmp(buf, grid) {
  const offset = buf.readUInt32LE(10);
  const bpp = buf.readUInt16LE(28);
  const bytes = bpp / 8;
  const rowSize = Math.floor((bpp * grid + 31) / 32) * 4;
  const px = [];
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const i = offset + y * rowSize + x * bytes;
      /* BMP stores BGR */
      px.push([buf[i + 2], buf[i + 1], buf[i]]);
    }
  }
  return px;
}

export function coverStat(root) {
  return (cover) => stat(path.join(root, cover));
}

export function coverMeasure(root) {
  return async (cover) => {
    const file = path.join(root, cover);
    const dir = await mkdtemp(path.join(tmpdir(), "libcolor-"));
    const out = path.join(dir, "s.bmp");
    try {
      const [{ stdout }] = await Promise.all([
        run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]),
        run("sips", ["-z", String(GRID), String(GRID), "-s", "format", "bmp", file, "--out", out]),
      ]);
      return {
        width: Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1] ?? 0),
        height_px: Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1] ?? 0),
        px: decodeBmp(await readFile(out), GRID),
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

/* Re-encode a cover down to a shelf-sized JPEG. sips writes in place from a
   copy, so the source is never touched. */
/* Two derivatives per cover. sips is macOS built-in and cannot write webp, so
   cwebp does that half, reading the jpeg sips just wrote rather than the
   original.

   Going through the jpeg is deliberate. `sips -Z` fits the longest side inside
   the box, while `cwebp -resize W 0` sets the width and lets the height run,
   so resizing a portrait poster from the original produced a webp half again
   taller than its jpeg and barely smaller in bytes. Re-encoding the already
   correct 700px jpeg gives a file about a fifth of its size, and at q80 on an
   image this small the second compression is not visible. */
/* sips reports these as "pixelWidth: 1400" lines. Returns null rather than
   throwing, and the caller then treats the image as landscape, which is the
   safe direction: bounding the width can only make a portrait smaller. */
async function jpegSize(file) {
  try {
    const { stdout } = await run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]);
    const width = Number(/pixelWidth:\s*(\d+)/.exec(stdout)?.[1]);
    const height = Number(/pixelHeight:\s*(\d+)/.exec(stdout)?.[1]);
    return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
  } catch {
    return null;
  }
}

export function coverEncoder(root, width, shelfWidth) {
  return async (cover, targets) => {
    const from = path.join(root, cover);
    const toJpeg = path.join(root, targets.jpeg);
    const toWebp = path.join(root, targets.webp);
    await mkdir(path.dirname(toJpeg), { recursive: true });
    await run("sips", ["-Z", String(width), "-s", "format", "jpeg", "-s", "formatOptions", "78", from, "--out", toJpeg]);
    await run("cwebp", ["-quiet", "-q", "80", toJpeg, "-o", toWebp]);
    /* cwebp's -resize sets the width outright, so the shelf copy is bounded by
       hand to keep the longest side inside the box the way `sips -Z` does. */
    const toShelf = path.join(root, targets.shelf);
    const box = Math.round(shelfWidth);
    const dims = await jpegSize(toJpeg);
    const resize = dims && dims.height > dims.width
      ? ["0", String(box)]
      : [String(box), "0"];
    await run("cwebp", ["-quiet", "-q", "78", "-resize", ...resize, toJpeg, "-o", toShelf]);
    const [jpeg, webp, shelf] = await Promise.all([stat(toJpeg), stat(toWebp), stat(toShelf)]);
    return { jpeg: jpeg.size, webp: webp.size, shelf: shelf.size };
  };
}
