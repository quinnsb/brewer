/* ============================================================
   LIBRARY COLORS — force a full resample of every cover

   Run:  node tools/library-colors.mjs

   Colour is part of library-build.mjs now, cached in
   data/library-palette.json and recomputed only when a cover file changes.
   This drops the cache so the next build samples everything again, which is
   what you want after changing how the palette is derived.
   ============================================================ */

import { rm } from "node:fs/promises";
import path from "node:path";

const CACHE = path.resolve(import.meta.dirname, "..", "data", "library-palette.json");
await rm(CACHE, { force: true });
console.log("palette cache cleared, run: node tools/library-build.mjs");
