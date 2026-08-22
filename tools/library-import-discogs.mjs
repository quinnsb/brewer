/* ============================================================
   IMPORT DISCOGS — the physical record collection, as albums

   Run:  node tools/library-import-discogs.mjs                report only
         node tools/library-import-discogs.mjs --apply         write it
         node tools/library-import-discogs.mjs --limit 20      a smaller bite

   In:   DISCOGS_TOKEN in .env, and the username in data/library-sources.json
   Out:  images/library/album-*.jpg        the sleeve
         data/library.raw.json             the album entries
         data/library-taxonomy.json        a genre per album
         data/library-additions.json       the seed, so a resync keeps them
         data/library-vinyl.json           discogs release id -> item id

   Discogs is a better source than the music APIs sync uses, because it is a
   record of what Quinn actually owns rather than a search result: every entry
   carries a sleeve image, a genre, a style, a label and a year, so nothing here
   is guessed and nothing needs transcribing.

   Genres come from Discogs' `styles` before its `genres`, because the styles are
   the specific ones ("Hard Bop", "Indie Rock") and the genres are the shelf
   headings ("Jazz", "Rock"). Both are folded into the vocabulary the catalog
   already uses, so a Discogs import does not start a second parallel set of
   genre names. Capped at two, matching the albums already there.

   Re-runnable. An album already in the catalog is skipped, matched on title and
   artist rather than on the Discogs id, so a record bought twice on two
   pressings does not become two shelf entries.
   ============================================================ */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { rawItemFor, seedFor } from "../lib/add-item.mjs";
import { loadEnv } from "./lib/env.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const APPLY = process.argv.includes("--apply");
const LIMIT = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;

const UA = "brewer-library/1.0 ( https://www.quinnbrewer.com )";
const PER_PAGE = 100;

/* Discogs' own genre names, folded into the words the catalog already uses.
   Anything not listed keeps its Discogs name in sentence case, which is how
   Hard bop, Cool jazz and the rest arrive. */
const GENRE_ALIAS = {
  "Folk, World, & Country": "Folk",
  "Funk / Soul": "Soul",
  "Hip Hop": "Hip-hop",
  "Stage & Screen": "Soundtrack",
  "Non-Music": "Spoken word",
  "Children's": "Family",
  "Rhythm & Blues": "R&B",
  "Rnb/Swing": "R&B",
};

/* Discogs styles that mean something the catalog already has a word for. */
const STYLE_ALIAS = {
  "Rock & Roll": "Rock and roll",
  "Rhythm & Blues": "R&B",
  "Folk, World, & Country": "Folk",
  Rnb: "R&B",
  Chanson: "Chanson",
};

/* Discogs styles too vague to be worth a filter entry. The genre is used
   instead when a release has nothing better. */
const VAGUE_STYLES = new Set(["Vocal", "Album", "Compilation", "Reissue", "Stereo", "Mono", "Limited Edition"]);

const sentenceCase = (text) =>
  text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

/* Discogs suffixes an artist name with a bracketed number when the name is
   ambiguous in their database: "Kenny G (2)". That is a database detail, not
   part of the name. */
const cleanArtist = (name) => name.replace(/\s*\(\d+\)\s*$/, "").trim();

function normalise(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*\(\d+\)/g, "")
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function genresFor(info) {
  const styles = (info.styles || [])
    .filter((style) => !VAGUE_STYLES.has(style))
    .map((style) => STYLE_ALIAS[style] || sentenceCase(style));
  const genres = (info.genres || []).map((genre) => GENRE_ALIAS[genre] || sentenceCase(genre));
  const picked = [...new Set([...styles, ...genres])].slice(0, 2);
  /* applyTaxonomy throws on an item with no genres, and it is right to: an item
     with none cannot be reached through the catalog filters. Discogs has always
     given at least one, but a release with neither would otherwise take the
     whole build down. */
  return picked.length ? picked : ["Rock"];
}

function factsFor(info) {
  const artists = (info.artists || []).map((a) => cleanArtist(a.name)).join(", ");
  const label = (info.labels || []).map((l) => cleanArtist(l.name))[0];
  const format = (info.formats || [])
    .flatMap((f) => [f.name, ...(f.descriptions || [])])
    .filter((word) => word && word !== "LP")
    .join(", ");
  return [
    ["Artist", artists],
    ["Released", info.year ? String(info.year) : null],
    ["Genre", (info.styles || [])[0] || (info.genres || [])[0] || null],
    ["Label", label || null],
    ["Format", format || "Vinyl"],
  ];
}

async function get(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Authorization: `Discogs token=${process.env.DISCOGS_TOKEN}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Discogs ${response.status} for ${url.replace(/token=[^&]*/, "token=…")}`);
  return response;
}

/* Discogs asks for one request a second on the authenticated tier. */
async function collection(username) {
  const releases = [];
  for (let page = 1; ; page += 1) {
    const url = `https://api.discogs.com/users/${encodeURIComponent(username)}/collection/folders/0/releases?per_page=${PER_PAGE}&page=${page}&sort=artist`;
    const payload = await (await get(url)).json();
    releases.push(...(payload.releases || []));
    if (page >= (payload.pagination?.pages || 1)) break;
    await new Promise((r) => setTimeout(r, 1100));
  }
  return releases;
}

async function main() {
  await loadEnv(ROOT);
  if (!process.env.DISCOGS_TOKEN) {
    console.error("DISCOGS_TOKEN is not set. Put it in .env; see .env.example.");
    process.exit(1);
  }

  const read = async (file) => JSON.parse(await readFile(path.join(ROOT, file), "utf8"));
  const raw = await read("data/library.raw.json");
  const taxonomy = await read("data/library-taxonomy.json");
  const additions = await read("data/library-additions.json").catch(() => ({ items: [] }));
  const sources = await read("data/library-sources.json");
  const vinyl = await read("data/library-vinyl.json").catch(() => ({}));

  const username = sources.discogs?.username;
  if (!username) {
    console.error("No discogs.username in data/library-sources.json.");
    process.exit(1);
  }

  const releases = await collection(username);
  console.log(`${releases.length} records in the ${username} collection`);

  /* Matched on title and artist, not on the Discogs id: two pressings of the
     same record are one album on the shelf. */
  const existing = new Map(
    raw.items
      .filter((item) => item.type === "album")
      .map((item) => [`${normalise(item.title)}|${normalise(item.creator)}`, item.id])
  );

  const nextRaw = [...raw.items];
  const nextTaxonomy = { ...taxonomy };
  const seeds = [];
  const covers = [];
  const nextVinyl = { ...vinyl };
  let added = 0;
  let known = 0;
  const failed = [];

  for (const release of releases) {
    const info = release.basic_information;
    const title = info.title?.trim();
    const artist = (info.artists || []).map((a) => cleanArtist(a.name)).join(", ");
    if (!title) continue;

    const key = `${normalise(title)}|${normalise(artist)}`;
    if (existing.has(key)) {
      known += 1;
      nextVinyl[release.id] = existing.get(key);
      continue;
    }
    if (added >= LIMIT) continue;

    let item;
    try {
      item = rawItemFor({
        type: "album",
        title,
        creator: artist,
        year: info.year || null,
        detail: "Album",
        sourceUrl: `https://www.discogs.com/release/${release.id}`,
        facts: factsFor(info),
      });
    } catch (err) {
      failed.push([title, err.message]);
      continue;
    }
    if (nextRaw.some((existingItem) => existingItem.id === item.id)) {
      /* Two different records whose titles slug to the same id. Skipped rather
         than silently overwriting the first one. */
      failed.push([title, `id collision with ${item.id}`]);
      continue;
    }

    const genres = genresFor(info);
    nextRaw.push(item);
    nextTaxonomy[item.id] = genres;
    seeds.push(seedFor(item));
    existing.set(key, item.id);
    nextVinyl[release.id] = item.id;
    if (info.cover_image) covers.push([item.id, item.cover, info.cover_image]);
    added += 1;
    console.log(`  ${item.id.padEnd(46)} ${genres.join(", ")}`);
  }

  for (const [title, why] of failed) console.warn(`  SKIP ${title.slice(0, 44).padEnd(46)} ${why}`);
  console.log(`\n${added} to add, ${known} already in the library, ${failed.length} skipped`);

  if (!APPLY) {
    console.log("Report only. Re-run with --apply to write.");
    return;
  }

  /* Sleeves last, and only after the catalog entries are known good, so a
     failed download cannot leave an image with no item pointing at it. */
  await mkdir(path.join(ROOT, "images", "library"), { recursive: true });
  let saved = 0;
  for (const [id, file, url] of covers) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await writeFile(path.join(ROOT, file), Buffer.from(await response.arrayBuffer()));
      saved += 1;
    } catch (err) {
      console.warn(`  COVER ${id}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  const write = (file, value) => writeFile(path.join(ROOT, file), `${JSON.stringify(value, null, 2)}\n`);
  await write("data/library.raw.json", { ...raw, items: nextRaw });
  await write("data/library-taxonomy.json", nextTaxonomy);
  await write("data/library-additions.json", {
    ...additions,
    importedAt: new Date().toISOString(),
    items: [...(additions.items || []), ...seeds],
  });
  /* Sorted, so a re-run diffs on what changed rather than on key order. */
  await write("data/library-vinyl.json",
    Object.fromEntries(Object.keys(nextVinyl).sort((a, b) => Number(a) - Number(b)).map((k) => [k, nextVinyl[k]])));

  console.log(`${saved} sleeves saved, ${added} albums written.`);
  console.log("Now run: node tools/library-build.mjs");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
