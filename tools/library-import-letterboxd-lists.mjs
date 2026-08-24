/* ============================================================
   IMPORT LETTERBOXD LISTS — a public list becomes a shelf list

   Run:  node tools/library-import-letterboxd-lists.mjs <list-url> [...]
         node tools/library-import-letterboxd-lists.mjs <list-url> --apply
         node tools/library-import-letterboxd-lists.mjs <list-url> --limit 10

   Without --apply nothing is written and the run is a report: which films are
   already on the shelf, which would be added, and which cannot be.

   This is not the same job as library-import-letterboxd.mjs, which reads a CSV
   export of your own account. This reads a public list page, in order, and
   turns it into an entry in data/library-lists.json.

   Order is the whole point. A ranked list is an argument about sequence, so
   the films are written in the order the page has them and never sorted.

   Most of the films in a list will not be on the shelf yet, so this adds them
   the same way library-add-films.mjs does, through lib/tmdb-film.mjs, which
   both call. A film TMDB cannot match, or has no genre for, or has no readable
   poster for, is reported and left out of the list rather than written as an
   id pointing at nothing.

   After --apply, run: node tools/library-build.mjs
   ============================================================ */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rawItemFor, seedFor } from "../lib/add-item.mjs";
import { buildNote } from "../lib/apply-note.mjs";
import { parseListPage, lastListPage, listTitle, listPageUrl } from "../lib/letterboxd-list.mjs";
import { filmFromTmdb, tmdbGenreNames } from "../lib/tmdb-film.mjs";
import { get } from "./lib/covers.mjs";
import { loadEnv } from "./lib/env.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;
const URLS = process.argv.slice(2).filter((arg) => arg.startsWith("http"));

/* A page of a list is a page of a website, and Letterboxd answers a bare
   script with 403 on anything past the first. One at a time, with a pause. */
const PAGE_PAUSE = 900;
const TMDB_PAUSE = 130;

const LIST_URL = /^https?:\/\/(?:www\.)?letterboxd\.com\/([A-Za-z0-9_][A-Za-z0-9_-]{0,30})\/list\/([A-Za-z0-9][A-Za-z0-9_-]{0,120})\/?$/;

function parseListUrl(url) {
  const match = LIST_URL.exec(url.trim());
  if (!match) throw new Error(`${url} is not a Letterboxd list URL`);
  return { username: match[1], slug: match[2] };
}

/* Titles vary in punctuation and case between a list page and the shelf, so
   matching is on letters and digits only. The year decides between a film and
   its remake; a list entry with no year falls back to the title alone. */
const normalize = (text) =>
  String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function indexByTitle(items) {
  const index = new Map();
  for (const item of items) {
    const key = normalize(item.title);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(item);
  }
  return index;
}

function findOnShelf(index, film) {
  const candidates = index.get(normalize(film.title)) || [];
  if (!candidates.length) return null;
  if (!film.year) return candidates[0];
  const sameYear = candidates.find((c) => String(c.year ?? "").slice(0, 4) === String(film.year));
  return sameYear || candidates[0];
}

async function fetchList({ username, slug }) {
  const first = await (await get(listPageUrl(username, slug))).text();
  const pages = lastListPage(first, slug);
  const films = parseListPage(first);
  const title = listTitle(first);

  for (let page = 2; page <= pages; page += 1) {
    await new Promise((r) => setTimeout(r, PAGE_PAUSE));
    const html = await (await get(listPageUrl(username, slug, page))).text();
    films.push(...parseListPage(html));
  }
  return { films, pages, title };
}

/* The title Letterboxd shows carries the author's own framing after a comma
   or a colon. "Hayao Miyazaki, Ranked" is the name of the thing; keep it. */
function listId(slug) {
  return String(slug).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function main() {
  if (!URLS.length) {
    console.error("Usage: node tools/library-import-letterboxd-lists.mjs <list-url> [...] [--apply] [--limit N]");
    process.exit(1);
  }
  await loadEnv(ROOT);
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    console.error("TMDB_API_KEY is not set. Put it in .env; see .env.example.");
    process.exit(1);
  }

  const read = async (file) => JSON.parse(await readFile(path.join(ROOT, file), "utf8"));
  const raw = await read("data/library.raw.json");
  const taxonomy = await read("data/library-taxonomy.json");
  const additions = await read("data/library-additions.json").catch(() => null);
  const lists = await read("data/library-lists.json");
  /* Letterboxd slug -> TMDB id, for the few films whose TMDB title is one
     nobody uses. See the file's own comment. */
  const overrides = await read("data/library-film-tmdb-overrides.json").catch(() => ({}));

  const genres = await tmdbGenreNames(key);
  const shelf = indexByTitle(raw.items.filter((item) => item.type === "film"));
  const have = new Set(raw.items.map((item) => item.id));

  const added = [];
  const notes = [];
  const covers = [];
  const nextLists = [...lists];
  let untried = 0;

  for (const url of URLS) {
    const { username, slug } = parseListUrl(url);
    const { films, pages, title } = await fetchList({ username, slug });
    console.log(`\n### ${title || slug}  (${films.length} films over ${pages} page${pages === 1 ? "" : "s"})`);

    const ids = [];
    const skipped = [];

    for (const film of films) {
      const onShelf = findOnShelf(shelf, film);
      if (onShelf) { ids.push(onShelf.id); continue; }

      /* Not on the shelf, so it has to be added before it can be listed. */
      let candidate;
      try {
        candidate = rawItemFor({ type: "film", title: film.title, year: film.year, detail: "Film" });
      } catch (err) {
        skipped.push([film.title, err.message]);
        continue;
      }
      /* Already added by an earlier list in this same run. */
      if (have.has(candidate.id)) { ids.push(candidate.id); continue; }
      if (added.length >= LIMIT) { untried += 1; continue; }

      try {
        const override = overrides[film.letterboxdSlug]?.tmdb ?? null;
        const built = await filmFromTmdb(film, key, genres, { tmdbId: override });
        if (have.has(built.rawItem.id)) { ids.push(built.rawItem.id); continue; }

        have.add(built.rawItem.id);
        added.push({ rawItem: built.rawItem, genres: built.genres });
        covers.push([built.rawItem.cover, built.poster]);
        ids.push(built.rawItem.id);

        /* The rating on a list page is the list author's, not Quinn's, so it
           is not written as his. A note is only made when there is something
           of his own to put in it, which at import time there is not. */
        const note = buildNote({ rating: null, starred: false, finished: null, body: "" });
        if (note) notes.push([`content/library/${built.rawItem.id}.md`, note]);

        console.log(`  ${APPLY ? "add " : "would"}  ${built.rawItem.id.slice(0, 44).padEnd(46)} ${built.genres.join(", ")}`);
      } catch (err) {
        skipped.push([film.title, err.message]);
      }
      await new Promise((r) => setTimeout(r, TMDB_PAUSE));
    }

    for (const [filmTitle, why] of skipped) console.log(`  skip  ${filmTitle.slice(0, 44).padEnd(46)} ${why}`);
    console.log(`  ${ids.length} of ${films.length} films in the list`);

    const id = listId(slug);
    const entry = {
      id,
      type: "film",
      title: title || slug,
      intro: "",
      ranked: true,
      items: ids,
    };
    const at = nextLists.findIndex((list) => list.id === id);
    /* Re-running a list replaces it rather than appending a second copy, and
       keeps whatever intro was written for it by hand. */
    if (at === -1) nextLists.push(entry);
    else nextLists[at] = { ...entry, intro: nextLists[at].intro || "" };
  }

  console.log(
    `\n${added.length} film${added.length === 1 ? "" : "s"} to add across ${URLS.length} list${URLS.length === 1 ? "" : "s"}` +
    (untried ? `, ${untried} not attempted (--limit ${LIMIT})` : "")
  );

  if (!APPLY) {
    console.log("\nNothing was written. Re-run with --apply.");
    return;
  }

  const nextRaw = { ...raw, items: [...raw.items, ...added.map((a) => a.rawItem)] };
  const nextTaxonomy = { ...taxonomy };
  for (const { rawItem, genres: names } of added) nextTaxonomy[rawItem.id] = names;
  const nextAdditions = {
    importedAt: new Date().toISOString(),
    source: "library-import-letterboxd-lists",
    items: [...(additions?.items || []), ...added.map((a) => seedFor(a.rawItem))],
  };

  for (const [file, buffer] of covers) await writeFile(path.join(ROOT, file), buffer);
  for (const [file, text] of notes) await writeFile(path.join(ROOT, file), text);
  await writeFile(path.join(ROOT, "data", "library.raw.json"), `${JSON.stringify(nextRaw, null, 2)}\n`);
  await writeFile(path.join(ROOT, "data", "library-taxonomy.json"), `${JSON.stringify(nextTaxonomy, null, 2)}\n`);
  await writeFile(path.join(ROOT, "data", "library-additions.json"), `${JSON.stringify(nextAdditions, null, 2)}\n`);
  await writeFile(path.join(ROOT, "data", "library-lists.json"), `${JSON.stringify(nextLists, null, 2)}\n`);

  console.log(`\nWrote ${covers.length} posters and ${nextLists.length} lists.`);
  console.log("Now run: node tools/library-build.mjs");
}

main().catch((error) => { console.error(error); process.exit(1); });
