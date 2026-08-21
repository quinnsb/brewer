/* ============================================================
   ADD BOOKS — a chosen batch, straight onto the shelf

   Run:  node tools/library-add-books.mjs           report only
         node tools/library-add-books.mjs --apply    write it

   The Import tab in the admin is the way to do this one at a time, with a
   human looking at each candidate. This is the same path in bulk, for when the
   answer is already "all of these": it takes the titles listed below, reads the
   rating and the date read out of the Goodreads feed so nothing has to be
   retyped, finds a high resolution cover, and writes what library-sync.mjs
   owns plus the seed that stops a resync dropping them.

   It writes library.raw.json, the taxonomy, the additions seed and one note per
   book. It does not write library.json: that is the build's job, and running it
   afterwards is what samples the covers and produces the page data.
   ============================================================ */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rawItemFor, seedFor } from "../lib/add-item.mjs";
import { buildNote } from "../lib/apply-note.mjs";
import { parseGoodreads, feedUrls } from "../lib/feeds.mjs";
import { bestCover, get } from "./lib/covers.mjs";
import { loadEnv } from "./lib/env.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const APPLY = process.argv.includes("--apply");

/* Clean titles rather than the feed's, which carry series numbering: the id is
   built from the title, and `book-the-fifth-season-the-broken-earth-1` is a URL
   nobody wants. Genres come from the vocabulary the shelf already uses, with
   Memoir the one addition, since nothing on it was nonfiction before. */
const BATCH = [
  ["Dune", "Frank Herbert", ["Science fiction"]],
  ["The Fifth Season", "N.K. Jemisin", ["Science fiction", "Fantasy"]],
  ["Project Hail Mary", "Andy Weir", ["Science fiction"]],
  ["The Way of Kings", "Brandon Sanderson", ["Fantasy"]],
  ["Song of Solomon", "Toni Morrison", ["Literary fiction"]],
  ["Tomorrow, and Tomorrow, and Tomorrow", "Gabrielle Zevin", ["Literary fiction"]],
  ["Norwegian Wood", "Haruki Murakami", ["Literary fiction"]],
  ["The Song of Achilles", "Madeline Miller", ["Historical fiction"]],
  ["Lincoln in the Bardo", "George Saunders", ["Literary fiction", "Historical fiction"]],
  ["Narrative of the Life of Frederick Douglass", "Frederick Douglass", ["Memoir"]],
  ["The Nightingale", "Kristin Hannah", ["Historical fiction"]],
  ["Go Tell It on the Mountain", "James Baldwin", ["Literary fiction"]],
  ["Of Mice and Men", "John Steinbeck", ["Literary fiction", "Novella"]],
  ["On Writing", "Stephen King", ["Memoir"]],
  ["Dark Matter", "Blake Crouch", ["Science fiction", "Thriller"]],
];

const norm = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function main() {
  await loadEnv(ROOT);

  const read = async (f) => JSON.parse(await readFile(path.join(ROOT, f), "utf8"));
  const raw = await read("data/library.raw.json");
  const taxonomy = await read("data/library-taxonomy.json");
  const additions = await read("data/library-additions.json").catch(() => null);

  const urls = feedUrls(await read("data/library-sources.json"));
  const feed = urls.goodreads ? parseGoodreads(await (await get(urls.goodreads)).text()) : [];
  console.log(`Goodreads feed: ${feed.length} entries\n`);

  const have = new Set(raw.items.map((item) => item.id));
  const items = [];
  const notes = [];
  const covers = [];
  const skipped = [];

  for (const [title, creator, genres] of BATCH) {
    /* The feed's title carries the series suffix, so match on it starting with
       the clean one rather than equalling it. */
    const wanted = norm(title);
    const entry = feed.find((candidate) => norm(candidate.title).startsWith(wanted));

    const candidate = {
      type: "book",
      title,
      creator,
      year: entry?.year ?? null,
      detail: entry?.detail || "Book",
      sourceUrl: entry?.sourceUrl || "",
      facts: (entry?.facts || []).map(([term, value]) => (term === "Author" ? ["Author", creator] : [term, value])),
    };

    let rawItem;
    try {
      rawItem = rawItemFor(candidate);
    } catch (err) {
      skipped.push([title, err.message]);
      continue;
    }
    if (have.has(rawItem.id)) {
      skipped.push([title, "already on the shelf"]);
      continue;
    }

    const found = await bestCover({ ...candidate, coverUrl: entry?.coverUrl }, { minWidth: 500 });
    if (!found.buffer) {
      skipped.push([title, `no cover over 500px (${found.notes.join("; ")})`]);
      continue;
    }

    have.add(rawItem.id);
    items.push({ rawItem, genres, entry });
    covers.push([rawItem.cover, found.buffer]);
    const note = buildNote({ rating: entry?.rating ?? null, starred: false, finished: entry?.finished ?? null, body: "" });
    if (note) notes.push([`content/library/${rawItem.id}.md`, note]);

    console.log(
      `  ${APPLY ? "add " : "would"}  ${rawItem.id.padEnd(44)} ` +
      `${String(found.size.width).padStart(4)}px  ${found.source.padEnd(7)} ` +
      `${entry?.rating ?? "-"}  ${entry?.finished ?? "no date"}`
    );
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(`\n${items.length} to add, ${skipped.length} skipped`);
  for (const [title, why] of skipped) console.log(`  skip  ${title.slice(0, 44).padEnd(46)} ${why}`);

  if (!APPLY) {
    console.log("\nNothing was written. Re-run with --apply.");
    return;
  }
  if (!items.length) return;

  const nextRaw = { ...raw, items: [...raw.items, ...items.map((i) => i.rawItem)] };
  const nextTaxonomy = { ...taxonomy };
  for (const { rawItem, genres } of items) nextTaxonomy[rawItem.id] = genres;
  const nextAdditions = {
    importedAt: new Date().toISOString(),
    source: "library-add-books",
    items: [...(additions?.items || []), ...items.map((i) => seedFor(i.rawItem))],
  };

  for (const [file, buffer] of covers) await writeFile(path.join(ROOT, file), buffer);
  for (const [file, text] of notes) await writeFile(path.join(ROOT, file), text);
  await writeFile(path.join(ROOT, "data", "library.raw.json"), `${JSON.stringify(nextRaw, null, 2)}\n`);
  await writeFile(path.join(ROOT, "data", "library-taxonomy.json"), `${JSON.stringify(nextTaxonomy, null, 2)}\n`);
  await writeFile(path.join(ROOT, "data", "library-additions.json"), `${JSON.stringify(nextAdditions, null, 2)}\n`);

  console.log(`\nWrote ${covers.length} covers and ${notes.length} notes.`);
  console.log("Now run: node tools/library-build.mjs");
}

main().catch((error) => { console.error(error); process.exit(1); });
