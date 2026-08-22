/* ============================================================
   LIBRARY COVERS — replace a grainy cover with the best one available

   Run:  node tools/library-covers.mjs            report only, writes nothing
         node tools/library-covers.mjs --apply     download and install
         node tools/library-covers.mjs --min 700   what counts as too small

   Out:  images/library/overrides/<id>.jpg

   Overrides rather than the covers themselves, because that directory already
   means "a human chose this one" and library-sync.mjs will never overwrite it.
   The next `node tools/library-build.mjs` picks them up and resamples colour.

   Where the better files come from, and why the ceiling is where it is:

     books   iTunes' ebook catalogue is tried first: its artwork upgrades to
             2000px on request and it has nearly everything, which is what
             actually clears the shelf. Goodreads is the fallback, because it
             bakes the size into the filename so the `._SY475_` suffix can be
             dropped to ask for the original, but in practice it only holds a
             big original for some books. Open Library, the current source, is
             frequently under 300px.
     albums  the same iTunes trick, which lifts the few sleeves that came from
             Cover Art Archive's 500px endpoint.
     films   Letterboxd serves posters at whatever crop you ask for, so they
             come back at 1000x1500 against the roughly 250px Wikipedia holds.
             Wikipedia is not being stingy: film posters there are deliberately
             low resolution for fair use, so 250px IS the original and there is
             nothing bigger to fetch. That is why films need another source.
             iTunes cannot help: its movie search returns nothing at all
             now, for any title. TMDB is the real answer and is used whenever
             TMDB_API_KEY is set, which gets posters at around 2000px. Without
             the key, films fall back to whatever the Letterboxd feed happens
             to mention, which is recent watches only.

   Anything no source can improve is listed with the reason rather than quietly
   skipped, so the remaining gap stays visible instead of looking finished.
   ============================================================ */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseGoodreads, parseLetterboxd, feedUrls } from "../lib/feeds.mjs";
import { slug } from "./lib/identity.mjs";
import { loadEnv } from "./lib/env.mjs";
import { get, bestCover, aspectFits } from "./lib/covers.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OVERRIDE_DIR = path.join(ROOT, "images", "library", "overrides");
const APPLY = process.argv.includes("--apply");
const MIN = Number(process.argv[process.argv.indexOf("--min") + 1]) || 600;
const UA = "brewer-library-covers/0.1 ( https://www.quinnbrewer.com )";

async function main() {
  await loadEnv(ROOT);
  const [published, palette, sources] = await Promise.all([
    readFile(path.join(ROOT, "data", "library.json"), "utf8").then(JSON.parse),
    readFile(path.join(ROOT, "data", "library-palette.json"), "utf8").then(JSON.parse),
    readFile(path.join(ROOT, "data", "library-sources.json"), "utf8").then(JSON.parse).catch(() => ({})),
  ]);

  const urls = feedUrls(sources);
  const offered = new Map();
  for (const [name, url, parse] of [
    ["Goodreads", urls.goodreads, parseGoodreads],
    ["Letterboxd", urls.letterboxd, parseLetterboxd],
  ]) {
    if (!url) continue;
    try {
      const candidates = parse(await (await get(url)).text());
      for (const candidate of candidates) {
        const id = `${candidate.type}-${slug(candidate.title)}`;
        if (candidate.coverUrl && !offered.has(id)) offered.set(id, candidate.coverUrl);
      }
      console.log(`${name}: ${candidates.length} entries`);
    } catch (err) {
      console.warn(`  WARN  ${name} feed unavailable: ${err.message}`);
    }
  }

  /* Two ways a cover needs replacing: too small, or the wrong shape. Judging on
     width alone let Moonlight through at 960x1021, a nearly square image where a
     poster belongs, because 960 looked perfectly healthy. An override already in
     place was chosen deliberately and is left alone either way. */
  const wanted = published.items.filter((item) => {
    if (existsSync(path.join(OVERRIDE_DIR, `${item.id}.jpg`))) return false;
    const entry = palette[item.id];
    if (!entry?.width) return false;
    const tooSmall = entry.width < MIN;
    const wrongShape = !aspectFits(item.aspect, { width: entry.width, height: entry.height_px });
    return tooSmall || wrongShape;
  });

  const misshapen = wanted.filter((item) =>
    !aspectFits(item.aspect, { width: palette[item.id].width, height: palette[item.id].height_px })
  ).length;
  console.log(
    `\n${wanted.length} covers to replace ` +
    `(${wanted.length - misshapen} too small, ${misshapen} the wrong shape), ` +
    `${offered.size} offered by the feeds\n`
  );
  if (APPLY) await mkdir(OVERRIDE_DIR, { recursive: true });

  const upgraded = [];
  const stuck = [];

  for (const item of wanted) {
    const was = palette[item.id]?.width || 0;

    /* Books get the ebook catalogue first because it answers for almost
         everything; the feed is the fallback. Films have only the feed. */
    /* The shared picker measures several editions and keeps the biggest, which
       is the difference between Heart of Darkness at 665px and the same book at
       1500px from the same query. A replacement no bigger than what is already
       there is not an upgrade, so the floor is what the item already has. */
    /* A cover of the wrong shape has no width worth beating, so the floor drops
       to the plain minimum; otherwise the replacement has to be a real upgrade. */
    const rightShape = aspectFits(item.aspect, { width: was, height: palette[item.id].height_px });
    const found = await bestCover(
      { ...item, coverUrl: offered.get(item.id) },
      { minWidth: rightShape ? Math.round(was * 1.25) : 400, expectAspect: item.aspect }
    );
    if (!found.buffer) {
      stuck.push({ item, was, note: found.notes.join("; ") });
      continue;
    }
    if (APPLY) await writeFile(path.join(OVERRIDE_DIR, `${item.id}.jpg`), found.buffer);
    upgraded.push({ item, was, now: found.size.width });
    console.log(`  ${APPLY ? "wrote" : "would"}  ${item.id.padEnd(42)} ${was}px -> ${found.size.width}px  (${found.source})`);
    /* iTunes rate limits an unauthenticated caller fairly aggressively. */
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`\n${upgraded.length} upgraded, ${stuck.length} still low resolution`);
  if (stuck.length) {
    console.log("\nStill low resolution, and why:");
    for (const { item, was, note } of stuck) {
      console.log(`  ${String(was + "px").padEnd(7)} ${item.type.padEnd(5)} ${item.title.slice(0, 40).padEnd(42)} ${note || "not in either feed"}`);
    }
  }
  if (!APPLY && upgraded.length) console.log("\nNothing was written. Re-run with --apply.");
  if (APPLY && upgraded.length) console.log("\nNow run: node tools/library-build.mjs");
}

main().catch((error) => { console.error(error); process.exit(1); });
