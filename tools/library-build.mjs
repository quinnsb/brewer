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
import { applyExternalRatings } from "./lib/external-rating.mjs";
import { librarySchema } from "./lib/schema.mjs";
import { applyListening } from "./lib/listening.mjs";
import { applyWatching } from "./lib/watching.mjs";
import { applyPalette, refreshPaletteCache } from "./lib/palette.mjs";
import { validateLists } from "./lib/lists.mjs";
import { applyThumbs, refreshThumbs, THUMB_WIDTH, SHELF_WIDTH } from "./lib/thumbs.mjs";
import { coverStat, coverMeasure, coverEncoder } from "./lib/sips.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
/* Absolute urls for the structured data, which has to point at the live site
   rather than at a relative path. */
const SITE = "https://www.quinnbrewer.com";
const RAW = path.join(ROOT, "data", "library.raw.json");
const OUT = path.join(ROOT, "data", "library.json");
const TAXONOMY = path.join(ROOT, "data", "library-taxonomy.json");
const LISTENING = path.join(ROOT, "data", "library-listening.json");
const WATCHING = path.join(ROOT, "data", "library-watching.json");
const PALETTE = path.join(ROOT, "data", "library-palette.json");
const LISTS = path.join(ROOT, "data", "library-lists.json");
const THUMBS = path.join(ROOT, "data", "library-thumbs.json");
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
  const watching = await readJson(WATCHING, {});
  const catalog = applyTaxonomy(applyWatching(applyListening(raw.items, listening), watching), taxonomy);
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
  const coloured = applyPalette(merged, cache);

  /* Shelf-sized copies. The covers are deliberately large for the detail view;
     handing those to a row of thumbnails is what stopped them loading on a
     phone. */
  const thumbs = await refreshThumbs(coloured, await readJson(THUMBS, {}), {
    stat: coverStat(ROOT),
    encode: coverEncoder(ROOT, THUMB_WIDTH, SHELF_WIDTH),
    onLog: (line) => console.log(line),
  });
  /* The outside score, lifted out of the facts table into a field the catalog
     can actually sort on. */
  const items = applyExternalRatings(applyThumbs(coloured, thumbs.cache));

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
  await writeFile(THUMBS, JSON.stringify(thumbs.cache, null, 2));
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2));

  /* The structured data goes into library.html itself, between the marker tags,
     so the crawler sees it in the served HTML rather than after the JS has run.
     Rewritten in place on every build, so it tracks the catalog by itself.

     All 185 items rather than a sample. It is around 73KB of very repetitive
     JSON, which is 9KB once the edge compresses it, so completeness is close to
     free here. If it ever stops being free, cap it per type. */
  const schemaFile = path.join(ROOT, "library.html");
  const html = await readFile(schemaFile, "utf8");
  const schema = JSON.stringify(librarySchema(items, SITE));
  const marker = /(<script type="application\/ld\+json" data-library-schema>)[\s\S]*?(<\/script>)/;
  if (!marker.test(html)) {
    console.warn("  WARN  library.html has no data-library-schema tag, structured data not written");
  } else {
    await writeFile(schemaFile, html.replace(marker, `$1${schema}$2`));
    console.log(`structured data -> library.html (${items.length} items, ${Math.round(schema.length / 1024)}KB)`);
  }

  const reviewed = items.filter((i) => i.reviewHtml).length;
  const rated = items.filter((i) => i.rating != null).length;
  const published = lists.filter((list) => list.items.length).length;
  console.log(
    `${items.length} items -> data/library.json ` +
    `(${reviewed} with reviews, ${rated} rated, ${computed} covers sampled, ${missed} missing)`
  );
  console.log(`${thumbs.made} thumbs encoded at ${THUMB_WIDTH}px, ${thumbs.missed} missing`);
  console.log(`${lists.length} lists (${published} with members, ${lists.length - published} still drafts)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
