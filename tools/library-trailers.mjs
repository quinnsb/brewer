/* ============================================================
   LIBRARY TRAILERS — find each film's trailer on YouTube, via TMDB

   Run:  node tools/library-trailers.mjs            report only
         node tools/library-trailers.mjs --apply     write the ids

   Out:  data/library-watching.json   { "film-moonlight": "9NJj12tJzqc" }

   TMDB lists a film's videos and says which are on YouTube and which are
   trailers, so this asks it once per film and records the id. Nothing at
   runtime touches TMDB: the site only ever embeds a YouTube id it already has,
   the same way it embeds a Spotify album id from library-listening.json.

   Preference order is official trailer, then any trailer, then a teaser. A clip
   is not a trailer and is never used: "First Five Minutes" is a spoiler, not a
   preview. An entry already present is left alone, so a hand-picked id survives
   a re-run.
   ============================================================ */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./lib/env.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "data", "library-watching.json");
const APPLY = process.argv.includes("--apply");

async function get(url, tries = 3) {
  let last;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`${response.status}`);
      return response;
    } catch (err) {
      last = err;
      if (attempt < tries - 1) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw last;
}

const words = (value) =>
  String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

function titlesAgree(want, got) {
  const wanted = words(want).filter((word) => !["the", "a", "an"].includes(word));
  if (!wanted.length) return false;
  const found = new Set(words(got));
  return wanted.every((word) => found.has(word));
}

/* A trailer, not a clip. Official first, because an unofficial upload is the
   one most likely to be taken down. */
function bestVideo(videos) {
  const youtube = videos.filter((video) => video.site === "YouTube" && video.key);
  return (
    youtube.find((v) => v.type === "Trailer" && v.official) ||
    youtube.find((v) => v.type === "Trailer") ||
    youtube.find((v) => v.type === "Teaser" && v.official) ||
    youtube.find((v) => v.type === "Teaser") ||
    null
  );
}

async function main() {
  await loadEnv(ROOT);
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    console.error("TMDB_API_KEY is not set. Put it in .env; see .env.example.");
    process.exit(1);
  }

  const published = JSON.parse(await readFile(path.join(ROOT, "data", "library.json"), "utf8"));
  const existing = await readFile(OUT, "utf8").then(JSON.parse).catch(() => ({}));
  const films = published.items.filter((item) => item.type === "film");

  const next = { ...existing };
  let found = 0;
  let kept = 0;
  const missing = [];

  for (const film of films) {
    if (next[film.id]) { kept += 1; continue; }
    try {
      const params = new URLSearchParams({ api_key: key, query: film.title });
      if (film.year) params.set("year", String(film.year));
      const search = await (await get(`https://api.themoviedb.org/3/search/movie?${params}`)).json();
      const match = (search.results || []).find((result) => titlesAgree(film.title, result.title));
      if (!match) { missing.push([film, "no TMDB match"]); continue; }

      const videos = await (await get(
        `https://api.themoviedb.org/3/movie/${match.id}/videos?api_key=${key}`
      )).json();
      const video = bestVideo(videos.results || []);
      if (!video) { missing.push([film, "TMDB lists no trailer"]); continue; }

      next[film.id] = video.key;
      found += 1;
      console.log(`  ${film.id.padEnd(38)} ${video.type.padEnd(8)} ${video.official ? "official" : "unofficial"}  ${video.key}`);
    } catch (err) {
      missing.push([film, err.message]);
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  /* Sorted, so a re-run produces a diff about what changed rather than about
     what order the keys happened to land in. */
  const sorted = Object.fromEntries(Object.keys(next).sort().map((id) => [id, next[id]]));

  console.log(`\n${found} found, ${kept} already recorded, ${missing.length} without one`);
  for (const [film, why] of missing) console.log(`  none  ${film.title.slice(0, 40).padEnd(42)} ${why}`);

  if (!APPLY) {
    console.log("\nNothing was written. Re-run with --apply.");
    return;
  }
  await writeFile(OUT, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`\nWrote ${Object.keys(sorted).length} ids to data/library-watching.json`);
  console.log("Now run: node tools/library-build.mjs");
}

main().catch((error) => { console.error(error); process.exit(1); });
