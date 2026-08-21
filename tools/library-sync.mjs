/* ============================================================
   LIBRARY SYNC — build-time metadata + cover art fetcher

   Run:  node tools/library-sync.mjs [--refresh-covers]
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

   The picks below are the curated baseline. Goodreads and Letterboxd
   export adapters can add items through data/library-imports-*.json.
   Everything downstream reads data/library.json, so imports do not touch
   the renderers or any hand-written review.
   ============================================================ */

import { writeFile, readFile, mkdir, rename, rm } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMG_DIR = path.join(ROOT, "images", "library");
const OUT = path.join(ROOT, "data", "library.raw.json");
const REFRESH_COVERS = process.argv.includes("--refresh-covers");
const IMPORT_FILES = [
  path.join(ROOT, "data", "library-imports-goodreads.json"),
  path.join(ROOT, "data", "library-imports-letterboxd.json"),
];

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
    { query: "Piranesi Susanna Clarke", title: "Piranesi", creator: "Susanna Clarke" },
    { query: "Starclimber Kenneth Oppel", title: "Starclimber", creator: "Kenneth Oppel" },
    { query: "Never Let Me Go Kazuo Ishiguro", title: "Never Let Me Go", creator: "Kazuo Ishiguro" },
    { query: "The Martian Andy Weir", title: "The Martian", creator: "Andy Weir" },
    { query: "The Bonesetter's Daughter Amy Tan", title: "The Bonesetter's Daughter", creator: "Amy Tan" },
    { query: "The Hobbit JRR Tolkien", title: "The Hobbit", creator: "J.R.R. Tolkien" },
    { query: "Dawn Octavia Butler", title: "Dawn", creator: "Octavia E. Butler" },
    { query: "Moby Dick Herman Melville", title: "Moby-Dick", creator: "Herman Melville" },
    { query: "Things Fall Apart Chinua Achebe", title: "Things Fall Apart", creator: "Chinua Achebe" },
    { query: "Hatchet Gary Paulsen", title: "Hatchet", creator: "Gary Paulsen" },
    { query: "Ender's Game Orson Scott Card", title: "Ender's Game", creator: "Orson Scott Card" },
    { query: "The Fifth Season NK Jemisin", title: "The Fifth Season", creator: "N. K. Jemisin" },
    { query: "A Day of Fallen Night Samantha Shannon", title: "A Day of Fallen Night", creator: "Samantha Shannon" },
    { query: "The Call of the Wild Jack London", title: "The Call of the Wild", creator: "Jack London" },
    { query: "The Stone Sky NK Jemisin", title: "The Stone Sky", creator: "N. K. Jemisin" },
    { query: "Heart of Darkness Joseph Conrad", title: "Heart of Darkness", creator: "Joseph Conrad" },
    { query: "Pretty as a Picture Elizabeth Little", title: "Pretty as a Picture", creator: "Elizabeth Little" },
    { query: "Ready Player Two Ernest Cline", title: "Ready Player Two", creator: "Ernest Cline" },
    { query: "Normal People Sally Rooney", title: "Normal People", creator: "Sally Rooney" },
    { query: "Feed MT Anderson", title: "Feed", creator: "M. T. Anderson" },
    { query: "The Fellowship of the Ring JRR Tolkien", title: "The Fellowship of the Ring", creator: "J.R.R. Tolkien" },
  ],
  album: [
    {
      query: "Coloring Book Chance the Rapper",
      title: "Coloring Book",
      creator: "Chance the Rapper",
      year: 2016,
      releaseGroupId: "2e93b949-f480-475b-a1bd-bbf9723ba13d",
      facts: albumFacts("Chance the Rapper", "2016-05-13", 14, "Hip-hop / gospel", "Self-released"),
    },
    {
      query: "Where the Light Is John Mayer Live in Los Angeles",
      title: "Where the Light Is: John Mayer Live in Los Angeles",
      creator: "John Mayer",
      year: 2008,
      releaseGroupId: "7c12144f-8c2a-30e5-a635-13cd3f3eadec",
      facts: albumFacts("John Mayer", "2008-07-01", 22, "Blues rock", "Columbia"),
    },
    { query: "In Between Dreams Jack Johnson", title: "In Between Dreams", creator: "Jack Johnson", year: 2005, facts: albumFacts("Jack Johnson", "2005-03-01", 14, "Singer-songwriter", "Brushfire") },
    { query: "Blonde on Blonde Bob Dylan", title: "Blonde on Blonde", creator: "Bob Dylan", year: 1966, facts: albumFacts("Bob Dylan", "1966-06-20", 14, "Rock", "Columbia") },
    { query: "Kind of Blue Miles Davis", title: "Kind of Blue", creator: "Miles Davis", year: 1959, facts: albumFacts("Miles Davis", "1959-08-17", 5, "Modal jazz", "Columbia") },
    { query: "Transatlanticism Death Cab for Cutie", title: "Transatlanticism", creator: "Death Cab for Cutie", year: 2003, facts: albumFacts("Death Cab for Cutie", "2003-10-07", 11, "Indie rock", "Barsuk") },
    { query: "Reading Writing and Arithmetic The Sundays", title: "Reading, Writing and Arithmetic", creator: "The Sundays", year: 1990, facts: albumFacts("The Sundays", "1990-01-15", 10, "Jangle pop", "Rough Trade") },
    { query: "Night Train Oscar Peterson Trio", title: "Night Train", creator: "Oscar Peterson Trio", year: 1963, facts: albumFacts("Oscar Peterson Trio", "1963-01-01", 11, "Jazz", "Verve") },
    { query: "A Boy Named Charlie Brown Vince Guaraldi Trio", title: "A Boy Named Charlie Brown", creator: "Vince Guaraldi Trio", year: 1969, facts: albumFacts("Vince Guaraldi Trio", "1969-12-04", 11, "Jazz soundtrack", "Fantasy") },
    { query: "Gordon Barenaked Ladies", title: "Gordon", creator: "Barenaked Ladies", year: 1992, facts: albumFacts("Barenaked Ladies", "1992-07-28", 15, "Alternative rock", "Sire / Reprise") },
    { query: "Come Away with Me Norah Jones", title: "Come Away with Me", creator: "Norah Jones", year: 2002, facts: albumFacts("Norah Jones", "2002-02-26", 14, "Jazz pop", "Blue Note") },
    { query: "Mr. Finish Line Vulfpeck", title: "Mr. Finish Line", creator: "Vulfpeck", year: 2017, facts: albumFacts("Vulfpeck", "2017-11-07", 10, "Funk", "Vulf Records") },
    { query: "Magic Ben Rector", title: "Magic", creator: "Ben Rector", year: 2018 },
    { query: "Messy Olivia Dean", title: "Messy", creator: "Olivia Dean", year: 2023 },
    { query: "Plans Death Cab for Cutie", title: "Plans", creator: "Death Cab for Cutie", year: 2005 },
    { query: "Thriller Michael Jackson", title: "Thriller", creator: "Michael Jackson", year: 1982 },
    { query: "Sound of Silver LCD Soundsystem", title: "Sound of Silver", creator: "LCD Soundsystem", year: 2007 },
    { query: "Songs in the Key of Life Stevie Wonder", title: "Songs in the Key of Life", creator: "Stevie Wonder", year: 1976 },
    { query: "Djo", title: "The Crux", creator: "Djo", year: 2025 },
    { query: "Upstairs at Eric's Yaz", title: "Upstairs at Eric's", creator: "Yaz", year: 1982 },
    { query: "Talon of the Hawk The Front Bottoms", title: "Talon of the Hawk", creator: "The Front Bottoms", year: 2013 },
    { query: "The Joshua Tree U2", title: "The Joshua Tree", creator: "U2", year: 1987 },
    { query: "Charm Clairo", title: "Charm", creator: "Clairo", year: 2024 },
    { query: "Jackson Square Arkells", title: "Jackson Square", creator: "Arkells", year: 2008 },
    { query: "Funeral Arcade Fire", title: "Funeral", creator: "Arcade Fire", year: 2004 },
  ],
  film: [
    "There Will Be Blood",
    "In the Mood for Love",
    "Paris, Texas (film)",
    "Burning (2018 film)",
    "The Master (2012 film)",
    {
      query: "Moonlight",
      title: "Moonlight",
      creator: "Barry Jenkins",
      year: 2016,
      facts: [
        ["Director", "Barry Jenkins"],
        ["Writer", "Barry Jenkins"],
        ["Producer", "Adele Romanski, Dede Gardner, Jeremy Kleiner"],
        ["Starring", "Trevante Rhodes, André Holland, Janelle Monáe"],
        ["Released", "2016-09-02"],
        ["Format", "Film"],
      ],
    },
    "Chungking Express",
    "First Reformed",
    "Ferris Bueller's Day Off",
    "The Empire Strikes Back",
    "Moonrise Kingdom",
    { query: "Ocean's Eleven (2001 film)", title: "Ocean's Eleven" },
    { query: "Mission: Impossible – Fallout", title: "Mission: Impossible Fallout" },
    "Kiki's Delivery Service",
    "La La Land",
    "Treasure Planet",
    "A Goofy Movie",
    "Meet the Robinsons",
  ],
  other: [
    "99% Invisible",
    "Design Matters with Debbie Millman",
    "Song Exploder",
    "The Rest Is History",
    "The Big Picture The Ringer",
    "Radio Ambulante Daniel Alarcon",
    "The Anthropocene Reviewed John Green",
    "My Brother My Brother and Me",
    "The Adventure Zone",
    "Wonderful Rachel and Griffin McElroy",
    "The Besties Video Games",
    {
      query: "Revisionist History Malcolm Gladwell",
      title: "Revisionist History",
      creator: "Pushkin Industries",
    },
  ],
};

function albumFacts(artist, released, tracks, genre, label) {
  return [
    ["Artist", artist],
    ["Released", released],
    ["Tracks", tracks],
    ["Genre", genre],
    ["Label", label],
  ];
}

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
    const temp = `${dest}.tmp`;
    try {
      await pipeline(res.body, createWriteStream(temp));
      await rename(temp, dest);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
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

const normalizedName = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function itunes(query, media, entity, preferred = null) {
  const url =
    `https://itunes.apple.com/search?limit=12&country=US&media=${media}` +
    (entity ? `&entity=${entity}` : "") +
    "&term=" + encodeURIComponent(query);
  const results = (await getJSON(url)).results ?? [];
  const wanted = normalizedName(query).split(/\s+/);
  const score = (result) => {
    const title = normalizedName(result.collectionName ?? result.trackName);
    const artist = normalizedName(result.artistName);
    const haystack = `${title} ${artist}`;
    let total = wanted.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
    if (preferred?.title) {
      const preferredTitle = normalizedName(preferred.title);
      if (title === preferredTitle) total += 100;
      else if (title.startsWith(preferredTitle)) total += 70 - Math.max(0, title.length - preferredTitle.length) / 4;
      if (!/\b(single|ep)\b/.test(preferredTitle) && /\b(single|ep)\b/.test(title)) total -= 100;
    }
    if (preferred?.creator && artist === normalizedName(preferred.creator)) total += 50;
    total += Math.min(Number(result.trackCount) || 0, 30) / 10;
    return total;
  };
  const r = results.sort((a, b) => score(b) - score(a))[0];
  if (!r?.artworkUrl100) return null;
  return {
    title: r.collectionName ?? r.trackName ?? query,
    creator: r.artistName ?? "Unknown",
    year: r.releaseDate ? Number(r.releaseDate.slice(0, 4)) : null,
    detail: r.trackCount ? `${r.trackCount} tracks` : null,
    /* mzstatic serves any square size by rewriting the path segment */
    coverUrl: r.artworkUrl100.replace(/\/\d+x\d+bb\./, "/1000x1000bb."),
    sourceUrl: r.collectionViewUrl ?? r.trackViewUrl ?? null,
    catalogId: r.collectionId ?? null,
    facts: [
      [media === "ebook" ? "Author" : media === "podcast" ? "Publisher" : "Artist", r.artistName],
      [media === "ebook" ? "Published" : "Released", r.releaseDate?.slice(0, 10)],
      [media === "ebook" ? "Pages" : media === "podcast" ? "Episodes" : "Tracks", r.pageCount ?? r.trackCount],
      ["Genre", r.primaryGenreName],
      [media === "ebook" ? "Publisher" : "Copyright", r.publisher ?? r.copyright],
    ].filter(([, value]) => value !== null && value !== undefined && value !== ""),
  };
}

function trackDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(Number(milliseconds) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function appleEmbedUrl(sourceUrl) {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    if (url.hostname !== "music.apple.com") return null;
    url.hostname = "embed.music.apple.com";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

async function resolveAlbum(query, preferred = null) {
  const album = await itunes(query, "music", "album", preferred);
  if (album && preferred?.title) {
    const expected = normalizedName(preferred.title).split(" ").filter((word) => word.length > 2);
    const actual = normalizedName(album.title);
    const coverage = expected.filter((word) => actual.includes(word)).length / Math.max(expected.length, 1);
    if (coverage < 0.6) return null;
  }
  if (!album?.catalogId) return album;
  try {
    const lookup = await getJSON(
      `https://itunes.apple.com/lookup?id=${album.catalogId}&entity=song&country=US`
    );
    const tracks = (lookup.results ?? [])
      .filter((result) => result.wrapperType === "track" && result.kind === "song")
      .sort((a, b) => (a.discNumber - b.discNumber) || (a.trackNumber - b.trackNumber))
      .map((track) => ({
        number: track.trackNumber,
        disc: track.discNumber,
        title: track.trackName,
        duration: trackDuration(track.trackTimeMillis),
      }));
    return {
      ...album,
      tracks,
      listenEmbedUrl: appleEmbedUrl(album.sourceUrl),
      detail: tracks.length ? `${tracks.length} tracks` : album.detail,
    };
  } catch {
    return { ...album, listenEmbedUrl: appleEmbedUrl(album.sourceUrl) };
  }
}

async function resolveOpenLibrary(query) {
  const url =
    "https://openlibrary.org/search.json?limit=1&fields=title,author_name,first_publish_year,cover_i,key,number_of_pages_median,publisher&q=" +
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
    facts: [
      ["Author", doc.author_name?.[0]],
      ["First published", doc.first_publish_year],
      ["Pages", doc.number_of_pages_median],
      ["Publisher", doc.publisher?.[0]],
    ].filter(([, value]) => value !== null && value !== undefined && value !== ""),
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
    facts: [
      ["Artist", rg["artist-credit"]?.[0]?.name],
      ["First released", rg["first-release-date"]],
      ["Format", rg["primary-type"]],
    ].filter(([, value]) => value),
  };
}

async function knownReleaseGroup(entry) {
  let catalog = null;
  try { catalog = await resolveAlbum(entry.query, entry); }
  catch { /* cover + core metadata below are enough */ }
  return {
    ...catalog,
    title: entry.title,
    creator: entry.creator,
    year: entry.year ?? null,
    detail: catalog?.detail ?? "Album",
    coverUrl: `https://coverartarchive.org/release-group/${entry.releaseGroupId}/front-500`,
    sourceUrl: `https://musicbrainz.org/release-group/${entry.releaseGroupId}`,
    facts: catalog?.facts ?? [
      ["Artist", entry.creator],
      ["Released", entry.year],
      ["Format", "Album"],
    ],
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
  let facts = [];
  const qid = page.pageprops?.wikibase_item;
  if (qid) {
    try {
      const ent = (await getJSON(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=claims&ids=${qid}`
      )).entities?.[qid];
      const claims = ent?.claims ?? {};
      const dateVal = claims.P577?.[0]?.mainsnak?.datavalue?.value?.time;
      if (dateVal) year = Number(dateVal.slice(1, 5));
      const claimIds = (property, limit = Infinity) =>
        (claims[property] ?? [])
          .map((claim) => claim.mainsnak?.datavalue?.value?.id)
          .filter(Boolean)
          .slice(0, limit);
      const dirIds = claimIds("P57");
      const writerIds = claimIds("P58");
      const producerIds = claimIds("P162");
      const castIds = claimIds("P161", 3);
      const genreIds = claimIds("P136", 4);
      const ids = [...new Set([...dirIds, ...writerIds, ...producerIds, ...castIds, ...genreIds])];
      const people = ids.length
        ? (await getJSON(
            `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=labels&languages=en&ids=${ids.join("|")}`
          )).entities ?? {}
        : {};
      const names = (idsToName) => idsToName
        .map((id) => people[id]?.labels?.en?.value)
        .filter(Boolean)
        .join(", ");
      creator = names(dirIds) || creator;
      const genres = genreIds.map((id) => people[id]?.labels?.en?.value).filter(Boolean);
      const released = dateVal?.slice(1, 11).replace(/-00-00$/, "").replace(/-00$/, "");
      facts = [
        ["Director", creator],
        ["Writer", names(writerIds)],
        ["Producer", names(producerIds)],
        ["Starring", names(castIds)],
        ["Released", released],
        ["Format", "Film"],
      ].filter(([, value]) => value);
      page.genres = genres;
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
    facts,
    genres: page.genres ?? [],
  };
}

const RESOLVERS = {
  book:  (q) => firstOf(q, [resolveOpenLibrary, (x) => itunes(x, "ebook")]),
  album: (q) => firstOf(q, [resolveAlbum, resolveCoverArtArchive]),
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
  const seedByType = Object.fromEntries(Object.entries(SEED).map(([type, entries]) => [type, [...entries]]));
  for (const file of IMPORT_FILES) {
    if (!existsSync(file)) continue;
    const imported = JSON.parse(await readFile(file, "utf8"));
    for (const entry of imported.items || []) {
      if (!seedByType[entry.type]) continue;
      const duplicate = seedByType[entry.type].some((candidate) => {
        const value = typeof candidate === "string" ? candidate : candidate.title || candidate.query;
        return normalizedName(value).includes(normalizedName(entry.title));
      });
      if (!duplicate) seedByType[entry.type].push(entry);
    }
  }
  const items = [];
  const failures = [];

  for (const [type, entries] of Object.entries(seedByType)) {
    for (const entry of entries) {
      const seed = typeof entry === "string" ? { query: entry } : entry;
      const { query } = seed;
      try {
        const meta = seed.releaseGroupId
          ? await knownReleaseGroup(seed)
          : type === "album"
            ? await firstOf(query, [(value) => resolveAlbum(value, seed), resolveCoverArtArchive])
            : await RESOLVERS[type](query);
        if (!meta) throw new Error("no result");

        /* Curated display names win over storefront edition suffixes such as
           "Bonus Track Version" or "Super Deluxe Edition". */
        if (seed.title) meta.title = seed.title;
        if (seed.creator) meta.creator = seed.creator;
        if (seed.year) meta.year = seed.year;
        if (seed.facts) meta.facts = seed.facts;
        if (seed.rating) meta.rating = seed.rating;
        if (seed.finished) meta.finished = seed.finished;
        if (seed.sourceUrl && !meta.sourceUrl) meta.sourceUrl = seed.sourceUrl;

        const id = `${type}-${slug(meta.title)}`;
        const file = `${id}.jpg`;
        const imagePath = path.join(IMG_DIR, file);
        if (REFRESH_COVERS || !existsSync(imagePath)) {
          try {
            await download(meta.coverUrl, imagePath);
          } catch (error) {
            if (!existsSync(imagePath)) throw error;
            process.stdout.write(`  cache ${type.padEnd(5)} ${meta.title} (cover host unavailable)\n`);
          }
        }

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
          catalogId: meta.catalogId ?? null,
          listenEmbedUrl: meta.listenEmbedUrl ?? null,
          tracks: meta.tracks ?? [],
          rating: meta.rating ?? null,
          finished: meta.finished ?? null,
          genres: seed.genres?.length ? seed.genres : meta.genres ?? [],
          facts: meta.facts ?? [],
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
