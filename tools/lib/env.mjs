/* Minimal .env reader. Flat KEY=value, optional quotes, # comments.

   Shared by the dev server and the local tools so a key lives in exactly one
   place. Anything already in the real environment wins, which is what makes
   `TMDB_API_KEY=... node tools/...` work for a one-off. */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export async function loadEnv(root) {
  const file = path.join(root, ".env");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const cut = trimmed.indexOf("=");
    if (cut === -1) continue;
    const key = trimmed.slice(0, cut).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(cut + 1).trim().replace(/^["'](.*)["']$/, "$1");
  }
}
