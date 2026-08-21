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
import { imageSize, get, titlesAgree, itunesCover, tmdbPoster } from "./lib/covers.mjs";

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

  /* An override already in place was chosen deliberately, so it is left alone
     however small it is. */
  const small = published.items.filter((item) => {
    const width = palette[item.id]?.width || 0;
    return width && width < MIN && !existsSync(path.join(OVERRIDE_DIR, `${item.id}.jpg`));
  });

  console.log(`\n${small.length} covers under ${MIN}px, ${offered.size} offered by the feeds\n`);
  if (APPLY) await mkdir(OVERRIDE_DIR, { recursive: true });

  const upgraded = [];
  const stuck = [];

  for (const item of small) {
    const was = palette[item.id]?.width || 0;

    /* Books get the ebook catalogue first because it answers for almost
         everything; the feed is the fallback. Films have only the feed. */
    const attempts = [];
    if (item.type === "book") attempts.push(["iTunes", () => itunesCover(item, "ebook")]);
    if (item.type === "album") attempts.push(["iTunes", () => itunesCover(item, "music")]);
    if (item.type === "film") attempts.push(["TMDB", () => tmdbPoster(item)]);
    if (offered.has(item.id)) attempts.push([item.type === "book" ? "Goodreads" : "Letterboxd", () => offered.get(item.id)]);

    if (!attempts.length) {
      stuck.push({ item, was, note: "no source for this type" });
      continue;
    }

    let best = null;
    const notes = [];
    for (const [name, resolve] of attempts) {
      try {
        const url = await resolve();
        if (!url) { notes.push(`${name} had nothing`); continue; }
        const buffer = Buffer.from(await (await get(url)).arrayBuffer());
        const size = imageSize(buffer);
        if (!size) { notes.push(`${name} sent an unreadable image`); continue; }
        /* A replacement no bigger than what is already there is not an upgrade,
           and writing it would only add a file to explain later. */
        if (size.width <= was * 1.25) { notes.push(`${name} offered only ${size.width}px`); continue; }
        best = { buffer, size, name };
        break;
      } catch (err) {
        notes.push(`${name} failed: ${err.message}`);
      }
    }

    if (!best) {
      stuck.push({ item, was, note: notes.join("; ") });
      continue;
    }
    if (APPLY) await writeFile(path.join(OVERRIDE_DIR, `${item.id}.jpg`), best.buffer);
    upgraded.push({ item, was, now: best.size.width });
    console.log(`  ${APPLY ? "wrote" : "would"}  ${item.id.padEnd(42)} ${was}px -> ${best.size.width}px  (${best.name})`);
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
