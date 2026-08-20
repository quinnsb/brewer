/* ============================================================
   LIBRARY SYNC — build-time metadata + cover art fetcher

   Run:  node tools/library-sync.mjs
   Out:  data/library.raw.json      raw synced catalog (NEVER hand-edit)
         images/library/<id>.jpg    cached cover art

   This script only ever writes library.raw.json. It must never write
   data/library.json, which is the merge of this file with the hand-written
   reviews in content/library/. Sync overwrites its output wholesale, so
   anything authored would be destroyed on the next run.

   Sources (all keyless, no OAuth, no signup):
     books   Open Library  -> covers.openlibrary.org  (fallback: iTunes ebook)
     albums  iTunes Search  -> mzstatic artwork        (fallback: Cover Art Archive)
     films   Wikipedia pageimages + Wikidata           (pilicense=any)
     other   iTunes Search (podcast)

   Notes on the sources, learned the hard way:
     - iTunes dropped `media=movie` from the public Search API; it now
       returns resultCount 0 for every film. Wikipedia is the keyless
       replacement, but its default `pilicense=free` hides fair-use
       posters, so `pilicense=any` is required.
     - MusicBrainz 503s under load regardless of how politely you space
       requests, so it is the fallback rather than the primary.

   The picks below are PLACEHOLDER seed data for library-lab.html.
   Replace `SEED` with a Goodreads/Letterboxd export reader once the
   renderer is chosen. Everything downstream reads data/library.json,
   so that swap does not touch the renderers.
   ============================================================ */

import { writeFile, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMG_DIR = path.join(ROOT, "images", "library");
const OUT = path.join(ROOT, "data", "library.raw.json");

/* MusicBrainz requires a descriptive UA with contact info. */
const UA = "brewer-library-sync/0.1 ( https://www.quinnbrewer.com )";

const SEED = {
  book: [
    "The Left Hand of Darkness Ursula K Le Guin",
    "Gravity's Rainbow Thomas Pynchon",
    "The Dispossessed Ursula K Le Guin",
    "Blood Meridian Cormac McCarthy",
    "Housekeeping Marilynne Robinson",
    "The Sellout Paul Beatty",
    "Cloud Atlas David Mitchell",
    "A Visit from the Goon Squad Jennifer Egan",
  ],
  album: [
    {
      query: "Coloring Book Chance the Rapper",
      title: "Coloring Book",
      creator: "Chance the Rapper",
      year: 2016,
      releaseGroupId: "2e93b949-f480-475b-a1bd-bbf9723ba13d",
    },
    {
      query: "Where the Light Is John Mayer Live in Los Angeles",
      title: "Where the Light Is: John Mayer Live in Los Angeles",
      creator: "John Mayer",
      year: 2008,
      releaseGroupId: "7c12144f-8c2a-30e5-a635-13cd3f3eadec",
    },
    { query: "In Between Dreams Jack Johnson", title: "In Between Dreams", creator: "Jack Johnson" },
    { query: "Blonde on Blonde Bob Dylan", title: "Blonde on Blonde", creator: "Bob Dylan" },
    { query: "Kind of Blue Miles Davis", title: "Kind of Blue", creator: "Miles Davis" },
    { query: "Transatlanticism Death Cab for Cutie", title: "Transatlanticism", creator: "Death Cab for Cutie" },
    { query: "Reading Writing and Arithmetic The Sundays", title: "Reading, Writing and Arithmetic", creator: "The Sundays" },
    { query: "Night Train Oscar Peterson Trio", title: "Night Train", creator: "Oscar Peterson Trio" },
    { query: "A Boy Named Charlie Brown Vince Guaraldi Trio", title: "A Boy Named Charlie Brown", creator: "Vince Guaraldi Trio" },
    { query: "Gordon Barenaked Ladies", title: "Gordon", creator: "Barenaked Ladies" },
    { query: "Come Away with Me Norah Jones", title: "Come Away with Me", creator: "Norah Jones" },
    { query: "Mr. Finish Line Vulfpeck", title: "Mr. Finish Line", creator: "Vulfpeck" },
  ],
  film: [
    "There Will Be Blood",
    "In the Mood for Love",
    "Paris, Texas (film)",
    "Burning (2018 film)",
    "The Master (2012 film)",
    "Moonlight",
    "Chungking Express",
    "First Reformed",
  ],
  other: [
    "99% Invisible",
    "Design Matters with Debbie Millman",
    "Song Exploder",
    "The Rest Is History",
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/* Public catalogue APIs are flaky under load (MusicBrainz especially),
   so every network call retries with backoff before giving up. */
async function withRetry(fn, tries = 3, baseDelay = 900) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (i < tries - 1) await sleep(baseDelay * (i + 1));
    }
  }
  throw lastErr;
}

async function getJSON(url) {
  return withRetry(async () => {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  });
}

async function download(url, dest) {
  return withRetry(async () => {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    await pipeline(res.body, createWriteStream(dest));
    return dest;
  });
}

/* ---------- per-type resolvers ---------- */

/* Try each resolver in order; first one with a coverUrl wins. */
async function firstOf(query, fns) {
  let lastErr;
  for (const fn of fns) {
    try {
      const out = await fn(query);
      if (out?.coverUrl) return out;
    } catch (err) { lastErr = err; }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function itunes(query, media, entity) {
  const url =
    `https://itunes.apple.com/search?limit=1&country=US&media=${media}` +
    (entity ? `&entity=${entity}` : "") +
    "&term=" + encodeURIComponent(query);
  const r = (await getJSON(url)).results?.[0];
  if (!r?.artworkUrl100) return null;
  return {
    title: r.collectionName ?? r.trackName ?? query,
    creator: r.artistName ?? "Unknown",
    year: r.releaseDate ? Number(r.releaseDate.slice(0, 4)) : null,
    detail: r.trackCount ? `${r.trackCount} tracks` : null,
    /* mzstatic serves any square size by rewriting the path segment */
    coverUrl: r.artworkUrl100.replace(/\/\d+x\d+bb\./, "/1000x1000bb."),
    sourceUrl: r.collectionViewUrl ?? r.trackViewUrl ?? null,
  };
}

async function resolveOpenLibrary(query) {
  const url =
    "https://openlibrary.org/search.json?limit=1&fields=title,author_name,first_publish_year,cover_i,key,number_of_pages_median&q=" +
    encodeURIComponent(query);
  const doc = (await getJSON(url)).docs?.[0];
  if (!doc?.cover_i) return null;
  return {
    title: doc.title,
    creator: doc.author_name?.[0] ?? "Unknown",
    year: doc.first_publish_year ?? null,
    detail: doc.number_of_pages_median ? `${doc.number_of_pages_median} pages` : null,
    coverUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
    sourceUrl: `https://openlibrary.org${doc.key}`,
  };
}

async function resolveCoverArtArchive(query) {
  const url =
    "https://musicbrainz.org/ws/2/release-group/?fmt=json&limit=1&query=" +
    encodeURIComponent(query);
  const rg = (await getJSON(url))["release-groups"]?.[0];
  if (!rg) return null;
  return {
    title: rg.title,
    creator: rg["artist-credit"]?.[0]?.name ?? "Unknown",
    year: rg["first-release-date"] ? Number(rg["first-release-date"].slice(0, 4)) : null,
    detail: rg["primary-type"] ?? null,
    coverUrl: `https://coverartarchive.org/release-group/${rg.id}/front-500`,
    sourceUrl: `https://musicbrainz.org/release-group/${rg.id}`,
  };
}

function knownReleaseGroup(entry) {
  return {
    title: entry.title,
    creator: entry.creator,
    year: entry.year ?? null,
    detail: "Album",
    coverUrl: `https://coverartarchive.org/release-group/${entry.releaseGroupId}/front-500`,
    sourceUrl: `https://musicbrainz.org/release-group/${entry.releaseGroupId}`,
  };
}

/* Wikipedia carries the fair-use poster in the infobox; Wikidata carries
   clean structured year + director. One page call, two Wikidata calls. */
async function resolveFilm(query) {
  const api =
    "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*" +
    "&prop=pageimages%7Cpageprops&piprop=thumbnail&pilicense=any&pithumbsize=800" +
    "&redirects=1&titles=" + encodeURIComponent(query);
  const pages = (await getJSON(api)).query?.pages ?? {};
  const page = Object.values(pages)[0];
  if (!page?.thumbnail?.source) return null;

  let year = null;
  let creator = "Unknown";
  const qid = page.pageprops?.wikibase_item;
  if (qid) {
    try {
      const ent = (await getJSON(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=claims&ids=${qid}`
      )).entities?.[qid];
      const claims = ent?.claims ?? {};
      const dateVal = claims.P577?.[0]?.mainsnak?.datavalue?.value?.time;
      if (dateVal) year = Number(dateVal.slice(1, 5));
      const dirId = claims.P57?.[0]?.mainsnak?.datavalue?.value?.id;
      if (dirId) {
        const dir = (await getJSON(
          `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=labels&languages=en&ids=${dirId}`
        )).entities?.[dirId];
        creator = dir?.labels?.en?.value ?? creator;
      }
    } catch { /* poster is the thing that matters; metadata is best-effort */ }
  }

  return {
    title: page.title,
    creator,
    year,
    detail: "Film",
    /* strip the analytics query Wikipedia appends to thumbnail URLs */
    coverUrl: page.thumbnail.source.split("?")[0],
    sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
  };
}

const RESOLVERS = {
  book:  (q) => firstOf(q, [resolveOpenLibrary, (x) => itunes(x, "ebook")]),
  album: (q) => firstOf(q, [(x) => itunes(x, "music", "album"), resolveCoverArtArchive]),
  film:  (q) => firstOf(q, [resolveFilm]),
  other: (q) => firstOf(q, [(x) => itunes(x, "podcast", "podcast")]),
};

/* Shelf physics differ per type, so each carries its own aspect + geometry.
   `shape` is what the renderers switch on. */
const SHAPE = {
  book:  { shape: "spine",  aspect: 0.66 },
  album: { shape: "sleeve", aspect: 1.0  },
  film:  { shape: "poster", aspect: 0.68 },
  other: { shape: "tile",   aspect: 1.0  },
};

/* Deterministic pseudo-random from id, so spine widths are stable
   across runs. Same trick complete-shelf uses (fnv1a + mulberry32). */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  await mkdir(IMG_DIR, { recursive: true });
  const items = [];
  const failures = [];

  for (const [type, entries] of Object.entries(SEED)) {
    for (const entry of entries) {
      const seed = typeof entry === "string" ? { query: entry } : entry;
      const { query } = seed;
      try {
        const meta = seed.releaseGroupId
          ? knownReleaseGroup(seed)
          : await RESOLVERS[type](query);
        if (!meta) throw new Error("no result");

        /* Curated display names win over storefront edition suffixes such as
           "Bonus Track Version" or "Super Deluxe Edition". */
        if (seed.title) meta.title = seed.title;
        if (seed.creator) meta.creator = seed.creator;
        if (seed.year) meta.year = seed.year;

        const id = `${type}-${slug(meta.title)}`;
        const file = `${id}.jpg`;
        await download(meta.coverUrl, path.join(IMG_DIR, file));

        const rand = mulberry32(fnv1a(id));
        items.push({
          id,
          type,
          ...SHAPE[type],
          title: meta.title,
          creator: meta.creator,
          year: meta.year,
          detail: meta.detail,
          cover: `images/library/${file}`,
          sourceUrl: meta.sourceUrl,
          /* physical variation, deterministic per id */
          height: Number((0.45 + rand() * 0.55).toFixed(3)),
          thickness: Number((0.6 + rand() * 0.9).toFixed(3)),
          /* filled in later: dominant colour, starred, note */
          starred: false,
          note: null,
        });
        process.stdout.write(`  ok   ${type.padEnd(5)} ${meta.title}\n`);
      } catch (err) {
        failures.push({ type, query, error: String(err.message ?? err) });
        process.stdout.write(`  MISS ${type.padEnd(5)} ${query} (${err.message})\n`);
      }
      /* Be polite to every public API, none of which we are paying for. */
      await sleep(type === "album" ? 400 : 250);
    }
  }

  await writeFile(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2)
  );
  console.log(`\n${items.length} items -> data/library.raw.json`);
  if (failures.length) console.log(`${failures.length} failed:`, failures);
}

main().catch((e) => { console.error(e); process.exit(1); });
