/* ============================================================
   LIBRARY DIRECTORS — fill in the director TMDB already knows

   Run:  node tools/library-directors.mjs            report only
         node tools/library-directors.mjs --apply     write the creators

   Out:  data/library.raw.json   (the `creator` field on film items)

   87 of 105 films arrived from Letterboxd with no director. The taxonomy step
   used to paper over that with the string "Unknown", which put a director of
   that name in the catalog filter and on the byline of every one of them. That
   substitution is gone, so the field is simply empty, and this fills it.

   No searching: every one of those films already carries its TMDB id in
   `sourceUrl`, so this asks /movie/{id}/credits directly and there is no
   wrong-film-same-title risk to guard against.

   Only `creator` is written, not a "Director" facts row. The detail panel drops
   any facts row the byline already carries, so a row here would render nowhere
   and only pad the JSON.

   A film that already has a creator is left alone, so a hand-corrected name
   survives a re-run.
   ============================================================ */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./lib/env.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW = path.join(ROOT, "data", "library.raw.json");
const APPLY = process.argv.includes("--apply");

/* TMDB rate limits, and this is 87 sequential calls, so failures are retried
   with a widening pause rather than dropped. Same shape as library-trailers. */
async function get(url, tries = 3) {
  let last;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (err) {
      last = err;
      if (attempt < tries - 1) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw last;
}

const tmdbId = (item) =>
  /themoviedb\.org\/movie\/(\d+)/.exec(item.sourceUrl || "")?.[1] ?? null;

/* Co-directors are joined with a comma because that is what the taxonomy step
   splits on, so "Joel Coen, Ethan Coen" becomes two people downstream and two
   separate entries in the director filter.

   Only the Directing department counts. TMDB files second-unit and assistant
   directors under the same job title on some films, and those are not who
   directed the picture, so the department is checked as well as the job. */
function directorsFrom(credits) {
  const names = (credits.crew || [])
    .filter((person) => person.job === "Director" && person.department === "Directing")
    .map((person) => person.name?.trim())
    .filter(Boolean);
  return [...new Set(names)];
}

async function main() {
  await loadEnv(ROOT);
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    console.error("TMDB_API_KEY is not set. Put it in .env; see .env.example.");
    process.exit(1);
  }

  const raw = JSON.parse(await readFile(RAW, "utf8"));
  const films = raw.items.filter((item) => item.type === "film");
  const todo = films.filter((film) => !String(film.creator || "").trim());

  console.log(`${films.length} films, ${films.length - todo.length} already credited, ${todo.length} to look up`);

  const found = new Map();
  const missing = [];

  for (const film of todo) {
    const id = tmdbId(film);
    if (!id) {
      missing.push([film.id, "no TMDB id in sourceUrl"]);
      continue;
    }
    try {
      const credits = await (await get(
        `https://api.themoviedb.org/3/movie/${id}/credits?api_key=${key}`
      )).json();
      const directors = directorsFrom(credits);
      if (!directors.length) {
        missing.push([film.id, "TMDB credits list no director"]);
        continue;
      }
      const creator = directors.join(", ");
      found.set(film.id, creator);
      console.log(`  ${film.id.padEnd(44)} ${creator}`);
    } catch (err) {
      missing.push([film.id, err.message]);
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  for (const [id, why] of missing) console.warn(`  MISS ${id.padEnd(44)} ${why}`);
  console.log(`\n${found.size} directors found, ${missing.length} missing`);

  if (!APPLY) {
    console.log("Report only. Re-run with --apply to write data/library.raw.json.");
    return;
  }

  const items = raw.items.map((item) =>
    found.has(item.id) ? { ...item, creator: found.get(item.id) } : item
  );
  await writeFile(RAW, `${JSON.stringify({ ...raw, items }, null, 2)}\n`);
  console.log(`Wrote ${found.size} creators to data/library.raw.json.`);
  console.log("Now run: node tools/library-build.mjs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
