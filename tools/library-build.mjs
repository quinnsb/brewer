/* ============================================================
   LIBRARY BUILD — merge synced catalog with hand-written reviews

   Run:  node tools/library-build.mjs
   In:   data/library.raw.json      from library-sync.mjs (network)
         content/library/<id>.md    hand-written reviews + overrides
         images/library/overrides/  hand-placed cover replacements
   Out:  data/library.json          what the page reads

   Offline and fast, so it is safe to run on every edit. Sync is the slow
   networked half and never writes this file.
   ============================================================ */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { mergeItem } from "./lib/merge.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW = path.join(ROOT, "data", "library.raw.json");
const OUT = path.join(ROOT, "data", "library.json");
const NOTES_DIR = path.join(ROOT, "content", "library");
const OVERRIDE_DIR = path.join(ROOT, "images", "library", "overrides");

async function readNote(id) {
  const file = path.join(NOTES_DIR, `${id}.md`);
  if (!existsSync(file)) return null;
  return readFile(file, "utf8");
}

async function main() {
  const raw = JSON.parse(await readFile(RAW, "utf8"));
  const ids = new Set(raw.items.map((i) => i.id));

  const items = [];
  for (const item of raw.items) {
    items.push(
      mergeItem(item, await readNote(item.id), existsSync(path.join(OVERRIDE_DIR, `${item.id}.jpg`)))
    );
  }

  /* A note whose filename matches no item is a silent no-op otherwise, and
     that is exactly how a typo'd id hides a missing review for months. */
  if (existsSync(NOTES_DIR)) {
    for (const f of await readdir(NOTES_DIR)) {
      if (!f.endsWith(".md")) continue;
      const id = f.slice(0, -3);
      if (!ids.has(id)) console.warn(`  WARN  ${f} matches no item id`);
    }
  }

  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2));

  const reviewed = items.filter((i) => i.reviewHtml).length;
  console.log(`${items.length} items -> data/library.json (${reviewed} with reviews)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
