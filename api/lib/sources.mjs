/* ============================================================
   SOURCES — searching the catalogues, and the hosts we will fetch from

   library-sync.mjs resolves one best match per seed and does it over the whole
   catalog. The admin needs the opposite: several candidates for one query, so a
   human can pick. Different job, so different code, but the record it produces
   is shaped to match sync's exactly.

   Anything the admin adds is also written back as a seed, so the next sync
   re-resolves it through sync's own resolvers and normalises whatever this
   produced. Facts from here are provisional by design.
   ============================================================ */

import { SHAPE } from "../../tools/lib/identity.mjs";

const UA = "brewer-library-admin/0.1 ( https://www.quinnbrewer.com )";

/* Only these hosts are ever fetched by the cover proxy. Without an allowlist,
   /api/cover would happily fetch a cloud metadata endpoint on request. */
const COVER_HOSTS = [
  "covers.openlibrary.org",
  "coverartarchive.org",
  "ia800000.us.archive.org",
  "upload.wikimedia.org",
  "is1-ssl.mzstatic.com",
  /* The import path: Goodreads serves book jackets and Letterboxd serves film
     posters, both at far higher resolution than the catalogue APIs. */
  "i.gr-assets.com",
  "images.gr-assets.com",
  "a.ltrbxd.com",
  "s.ltrbxd.com",
];
const COVER_SUFFIXES = [".mzstatic.com", ".us.archive.org", ".archive.org", ".wikimedia.org", ".gr-assets.com", ".ltrbxd.com"];

export function coverHostAllowed(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (COVER_HOSTS.includes(host)) return true;
  return COVER_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/* iTunes hands back a 100px thumbnail. The same URL serves the full size. */
export function upgradeArtwork(url) {
  return typeof url === "string" ? url.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/1000x1000bb.$1") : url;
}

export const yearOf = (value) => {
  const year = Number(String(value ?? "").slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : null;
};

/* Open Library resets connections and stalls handshakes often enough that one
   attempt is not a search, it is a coin flip. library-sync.mjs already survives
   this by retrying every catalogue call; the admin has to do the same, or a book
   search fails for a reason no human can act on. Each attempt gets its own
   timeout so a stalled handshake cannot eat the whole invocation. */
const TIMEOUT_MS = 7000;
const RETRY_DELAY_MS = 350;

export async function withRetry(fn, { tries = 3, delay = RETRY_DELAY_MS, sleep } = {}) {
  const wait = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      last = err;
      /* A 404 or a malformed query is an answer, not a hiccup. Retrying it only
         makes the wait longer and the failure no more informative. */
      if (err.permanent || attempt === tries - 1) break;
      await wait(delay * (attempt + 1));
    }
  }
  throw last;
}

async function getJson(url, { fetchImpl = fetch } = {}) {
  const host = new URL(url).hostname;
  return withRetry(async () => {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { "user-agent": UA, accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      /* fetch reports its own failures as the bare string "fetch failed", which
         is no use in an error line, so the host and the real cause go in here. */
      throw new Error(`${host} did not answer: ${err.cause?.message || err.message}`);
    }
    if (!response.ok) {
      const error = new Error(`${host} returned ${response.status}`);
      error.permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
      throw error;
    }
    return response.json();
  });
}

function itunesUrl(term, { media, entity, limit }) {
  const params = new URLSearchParams({ term, media, entity, limit: String(limit), country: "US" });
  return `https://itunes.apple.com/search?${params}`;
}

export function bookCandidates(payload) {
  return (payload.docs || [])
    .filter((doc) => doc.title && doc.cover_i)
    .map((doc) => ({
      type: "book",
      title: doc.title,
      creator: doc.author_name?.[0] || "",
      year: doc.first_publish_year || null,
      coverUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
      sourceUrl: `https://openlibrary.org${doc.key}`,
      detail: doc.number_of_pages_median ? `${doc.number_of_pages_median} pages` : "Book",
      facts: [
        ["Author", doc.author_name?.[0] || null],
        ["First published", doc.first_publish_year || null],
        ["Pages", doc.number_of_pages_median || null],
        ["Publisher", doc.publisher?.[0] || null],
      ].filter(([, value]) => value !== null && value !== undefined),
    }));
}

export function albumCandidates(payload) {
  return (payload.results || [])
    .filter((r) => r.collectionName && r.artworkUrl100)
    .map((r) => ({
      type: "album",
      title: r.collectionName,
      creator: r.artistName || "",
      year: yearOf(r.releaseDate),
      coverUrl: upgradeArtwork(r.artworkUrl100),
      sourceUrl: r.collectionViewUrl || "",
      detail: "Album",
      facts: [
        ["Artist", r.artistName || null],
        ["Released", r.releaseDate ? r.releaseDate.slice(0, 10) : null],
        ["Tracks", r.trackCount || null],
        ["Genre", r.primaryGenreName || null],
        ["Label", r.copyright || null],
      ].filter(([, value]) => value !== null && value !== undefined),
    }));
}

export function filmCandidates(payload) {
  return (payload.results || [])
    .filter((r) => r.trackName && r.artworkUrl100)
    .map((r) => ({
      type: "film",
      title: r.trackName,
      creator: r.artistName || "",
      year: yearOf(r.releaseDate),
      coverUrl: upgradeArtwork(r.artworkUrl100),
      sourceUrl: r.trackViewUrl || "",
      detail: "Film",
      facts: [
        ["Director", r.artistName || null],
        ["Released", r.releaseDate ? r.releaseDate.slice(0, 10) : null],
        ["Genre", r.primaryGenreName || null],
        ["Rated", r.contentAdvisoryRating || null],
        ["Format", "Film"],
      ].filter(([, value]) => value !== null && value !== undefined),
    }));
}

export function podcastCandidates(payload) {
  return (payload.results || [])
    .filter((r) => r.collectionName && r.artworkUrl100)
    .map((r) => ({
      type: "other",
      title: r.collectionName,
      creator: r.artistName || "",
      year: yearOf(r.releaseDate),
      coverUrl: upgradeArtwork(r.artworkUrl600 || r.artworkUrl100),
      sourceUrl: r.collectionViewUrl || "",
      catalogId: r.collectionId ?? null,
      detail: r.trackCount ? `${r.trackCount} tracks` : "Podcast",
      facts: [
        ["Publisher", r.artistName || null],
        ["Released", r.releaseDate ? r.releaseDate.slice(0, 10) : null],
        ["Episodes", r.trackCount || null],
        ["Genre", r.primaryGenreName || null],
      ].filter(([, value]) => value !== null && value !== undefined),
    }));
}

const SEARCHES = {
  book: async (q, limit) =>
    bookCandidates(await getJson(
      "https://openlibrary.org/search.json?fields=title,author_name,first_publish_year,cover_i,key,number_of_pages_median,publisher" +
      `&limit=${limit}&q=${encodeURIComponent(q)}`
    )),
  album: async (q, limit) => albumCandidates(await getJson(itunesUrl(q, { media: "music", entity: "album", limit }))),
  film: async (q, limit) => filmCandidates(await getJson(itunesUrl(q, { media: "movie", entity: "movie", limit }))),
  other: async (q, limit) => podcastCandidates(await getJson(itunesUrl(q, { media: "podcast", entity: "podcast", limit }))),
};

export async function search(type, query, limit = 8) {
  if (!SHAPE[type]) throw new Error(`Unknown type: ${type}`);
  if (!query?.trim()) return [];
  return SEARCHES[type](query.trim(), limit);
}
