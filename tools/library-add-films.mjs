/* ============================================================
   ADD FILMS — as much of the Letterboxd watched list as it will serve

   Run:  node tools/library-add-films.mjs            report only
         node tools/library-add-films.mjs --apply     write it
         node tools/library-add-films.mjs --limit 20  a smaller bite

   The RSS feed is the last forty-odd diary entries. The profile's film grid
   reaches further, and carries the title, the year and the rating on every
   poster, so nothing has to be transcribed by hand. Both are read and union'd.

   It is not the whole list: only the first page of the grid is served to a
   script (see below). The CSV export is what covers the rest.

   Posters and genres come from TMDB, matched on title and year. Genres are
   TMDB's own, folded into the vocabulary the shelf already uses, because
   inventing a genre per film for a hundred and something films would be
   guesswork where a factual answer exists.

   Posters are stored at w780 rather than `original`. The detail view is the only
   place the full file is used and it renders at well under 780px even on a large
   screen at 2x; `original` is nearer 2000px and a megabyte, which across this
   many films would put a hundred megabytes into the repository for pixels
   nothing ever displays. The 700px shelf thumb is generated from it as usual.
   ============================================================ */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rawItemFor, seedFor } from "../lib/add-item.mjs";
import { buildNote } from "../lib/apply-note.mjs";
import { parseFilmGrid, lastPage, filmsPageUrl } from "../lib/letterboxd-list.mjs";
import { parseLetterboxd, feedUrls } from "../lib/feeds.mjs";
import { filmFromTmdb, tmdbGenreNames } from "../lib/tmdb-film.mjs";
import { get } from "./lib/covers.mjs";
import { loadEnv } from "./lib/env.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;

async function main() {
  await loadEnv(ROOT);
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    console.error("TMDB_API_KEY is not set. Put it in .env; see .env.example.");
    process.exit(1);
  }

  const read = async (f) => JSON.parse(await readFile(path.join(ROOT, f), "utf8"));
  const raw = await read("data/library.raw.json");
  const taxonomy = await read("data/library-taxonomy.json");
  const additions = await read("data/library-additions.json").catch(() => null);
  const sources = await read("data/library-sources.json");
  const username = sources.letterboxd?.username;
  if (!username) {
    console.error("No Letterboxd username in data/library-sources.json.");
    process.exit(1);
  }

  /* ---- what Letterboxd will actually serve ----

     The first page of the grid comes back fine. Every page after it answers 403
     to anything that is not a browser, which is a deliberate block on
     programmatic pagination, so it is left alone rather than worked around by
     pretending to be Chrome. The RSS feed is union'd in because it reaches a
     little further back than page one does, and the two overlap heavily.

     What neither covers is the tail of the list. The sanctioned route for that
     is the CSV export from letterboxd.com/settings/data, which
     tools/library-import-letterboxd.mjs already reads. */
  const first = await (await get(filmsPageUrl(username))).text();
  const pages = lastPage(first);
  const fromGrid = parseFilmGrid(first);

  let fromFeed = [];
  try {
    const urls = feedUrls(sources);
    if (urls.letterboxd) fromFeed = parseLetterboxd(await (await get(urls.letterboxd)).text());
  } catch (err) {
    console.warn(`  WARN  RSS unavailable: ${err.message}`);
  }

  const byTitle = new Map();
  for (const film of [...fromGrid, ...fromFeed]) {
    const seen = byTitle.get(film.title.toLowerCase());
    /* The grid carries a rating for everything; the feed carries a watched date.
       Keep whichever has more. */
    if (!seen) byTitle.set(film.title.toLowerCase(), film);
    else byTitle.set(film.title.toLowerCase(), { ...film, ...seen, rating: seen.rating ?? film.rating, finished: seen.finished ?? film.finished });
  }
  const listed = [...byTitle.values()];

  console.log(
    `Letterboxd: ${fromGrid.length} from page 1 of ${pages}, ${fromFeed.length} from RSS, ` +
    `${listed.length} distinct. Pages 2 to ${pages} are 403 to a script, so the rest needs the CSV export.`
  );

  const genres = await tmdbGenreNames(key);
  const have = new Set(raw.items.map((item) => item.id));

  const items = [];
  const notes = [];
  const covers = [];
  const skipped = [];
  let already = 0;
  let untried = 0;

  for (const film of listed) {
    /* Counted rather than silently dropped, so --limit cannot masquerade as
       "everything else was already there". */
    if (items.length >= LIMIT) { untried += 1; continue; }

    let rawItem;
    try {
      rawItem = rawItemFor({ type: "film", title: film.title, year: film.year, detail: "Film" });
    } catch (err) {
      skipped.push([film.title, err.message]);
      continue;
    }
    if (have.has(rawItem.id)) { already += 1; continue; }

    try {
      /* Rebuilt now that TMDB has supplied the facts the grid does not carry. */
      const built = await filmFromTmdb(film, key, genres);
      const { size } = built;
      const names = built.genres;
      const buffer = built.poster;
      rawItem = built.rawItem;

      have.add(rawItem.id);
      items.push({ rawItem, genres: names });
      covers.push([rawItem.cover, buffer]);
      const note = buildNote({ rating: film.rating, starred: false, finished: film.finished ?? null, body: "" });
      if (note) notes.push([`content/library/${rawItem.id}.md`, note]);

      console.log(
        `  ${APPLY ? "add " : "would"}  ${rawItem.id.slice(0, 42).padEnd(44)} ` +
        `${String(size.width).padStart(4)}px  ${String(film.rating ?? "-").padStart(3)}  ${names.join(", ")}`
      );
    } catch (err) {
      skipped.push([film.title, err.message]);
    }
    await new Promise((r) => setTimeout(r, 130));
  }

  console.log(
    `\n${items.length} to add, ${already} already on the shelf, ${skipped.length} skipped` +
    (untried ? `, ${untried} not attempted (--limit ${LIMIT})` : "")
  );
  for (const [title, why] of skipped) console.log(`  skip  ${title.slice(0, 42).padEnd(44)} ${why}`);

  if (!APPLY) {
    console.log("\nNothing was written. Re-run with --apply.");
    return;
  }
  if (!items.length) return;

  const nextRaw = { ...raw, items: [...raw.items, ...items.map((i) => i.rawItem)] };
  const nextTaxonomy = { ...taxonomy };
  for (const { rawItem, genres: g } of items) nextTaxonomy[rawItem.id] = g;
  const nextAdditions = {
    importedAt: new Date().toISOString(),
    source: "library-add-films",
    items: [...(additions?.items || []), ...items.map((i) => seedFor(i.rawItem))],
  };

  for (const [file, buffer] of covers) await writeFile(path.join(ROOT, file), buffer);
  for (const [file, text] of notes) await writeFile(path.join(ROOT, file), text);
  await writeFile(path.join(ROOT, "data", "library.raw.json"), `${JSON.stringify(nextRaw, null, 2)}\n`);
  await writeFile(path.join(ROOT, "data", "library-taxonomy.json"), `${JSON.stringify(nextTaxonomy, null, 2)}\n`);
  await writeFile(path.join(ROOT, "data", "library-additions.json"), `${JSON.stringify(nextAdditions, null, 2)}\n`);

  console.log(`\nWrote ${covers.length} posters and ${notes.length} notes.`);
  console.log("Now run: node tools/library-build.mjs");
}

main().catch((error) => { console.error(error); process.exit(1); });
