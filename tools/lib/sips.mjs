/* The macOS half of the palette pass. Kept apart from palette.mjs so the
   colour logic can be tested without spawning a process.

   Covers are downsampled to an 8x8 BMP and read directly. BMP is used because
   it is uncompressed and trivially parseable, so this needs no image-decoding
   dependency. */

import { readFile, mkdtemp, rm, stat } from "node:fs/promises";
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
