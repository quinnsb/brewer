/* ============================================================
   LIBRARY BUILD — merge synced catalog with hand-written reviews

   Run:  node tools/library-build.mjs
   In:   data/library.raw.json      from library-sync.mjs (network)
         content/library/<id>.md    hand-written reviews + overrides
         images/library/overrides/  hand-placed cover replacements
   Out:  data/library.json          what the page reads
         data/library-palette.json  cover colour cache, keyed by item id

   Offline and fast, so it is safe to run on every edit. Sync is the slow
   networked half and never writes this file. Cover colour used to be a
   separate pass over data/library.json, which meant every build silently wiped
   it; it is folded in here now, cached so unchanged covers cost nothing.
   ============================================================ */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { mergeItem } from "./lib/merge.mjs";
import { applyTaxonomy } from "./lib/taxonomy.mjs";
import { applyListening } from "./lib/listening.mjs";
import { applyPalette, refreshPaletteCache } from "./lib/palette.mjs";
import { validateLists } from "./lib/lists.mjs";
import { coverStat, coverMeasure } from "./lib/sips.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW = path.join(ROOT, "data", "library.raw.json");
const OUT = path.join(ROOT, "data", "library.json");
const TAXONOMY = path.join(ROOT, "data", "library-taxonomy.json");
const LISTENING = path.join(ROOT, "data", "library-listening.json");
const PALETTE = path.join(ROOT, "data", "library-palette.json");
const LISTS = path.join(ROOT, "data", "library-lists.json");
const NOTES_DIR = path.join(ROOT, "content", "library");
const OVERRIDE_DIR = path.join(ROOT, "images", "library", "overrides");

async function readNote(id) {
  const file = path.join(NOTES_DIR, `${id}.md`);
  if (!existsSync(file)) return null;
  return readFile(file, "utf8");
}

async function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  const raw = JSON.parse(await readFile(RAW, "utf8"));
  const taxonomy = JSON.parse(await readFile(TAXONOMY, "utf8"));
  const listening = JSON.parse(await readFile(LISTENING, "utf8"));
  const catalog = applyTaxonomy(applyListening(raw.items, listening), taxonomy);
  const ids = new Set(raw.items.map((i) => i.id));

  const merged = [];
  for (const item of catalog) {
    merged.push(
      mergeItem(item, await readNote(item.id), existsSync(path.join(OVERRIDE_DIR, `${item.id}.jpg`)))
    );
  }

  /* Reviews can swap in an override cover, so colour has to be sampled from
     the merged items, not the raw ones. */
  const { cache, computed, missed } = await refreshPaletteCache(merged, await readJson(PALETTE, {}), {
    stat: coverStat(ROOT),
    measure: coverMeasure(ROOT),
    onLog: (line) => console.log(line),
  });
  const items = applyPalette(merged, cache);

  /* The lists file is not rewritten here, only checked. A structural mistake
     throws, because the page cannot render it; an id that has left the library
     is a warning, since a list outliving one of its items is normal. */
  const lists = await readJson(LISTS, []);
  const { warnings } = validateLists(lists, items);
  for (const warning of warnings) console.warn(`  WARN  ${warning}`);

  /* A note whose filename matches no item is a silent no-op otherwise, and
     that is exactly how a typo'd id hides a missing review for months. */
  if (existsSync(NOTES_DIR)) {
    for (const f of await readdir(NOTES_DIR)) {
      if (!f.endsWith(".md")) continue;
      const id = f.slice(0, -3);
      if (!ids.has(id)) console.warn(`  WARN  ${f} matches no item id`);
    }
  }

  await writeFile(PALETTE, JSON.stringify(cache, null, 2));
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2));

  const reviewed = items.filter((i) => i.reviewHtml).length;
  const rated = items.filter((i) => i.rating != null).length;
  const published = lists.filter((list) => list.items.length).length;
  console.log(
    `${items.length} items -> data/library.json ` +
    `(${reviewed} with reviews, ${rated} rated, ${computed} covers sampled, ${missed} missing)`
  );
  console.log(`${lists.length} lists (${published} with members, ${lists.length - published} still drafts)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
