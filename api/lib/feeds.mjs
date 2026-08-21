/* ============================================================
   FEEDS — what Goodreads and Letterboxd will still tell us

   Goodreads retired its API in December 2020, and Letterboxd's is an
   approval-gated closed beta. What remains is public RSS, and it is enough:

     goodreads.com/review/list_rss/<userId>?shelf=read
       title, author, rating, date read, page count, and a cover URL
     letterboxd.com/<user>/rss/
       recent diary entries only, with half-star ratings, watched dates,
       TMDB ids, and a poster

   Letterboxd's feed is a window, not a history, so the CSV export stays the way
   to backfill. This is for keeping up, not catching up.

   Parsing is done by hand rather than with an XML library, because the repo has
   no dependencies and these are two known feeds rather than arbitrary XML. The
   shapes they actually emit are pinned by tests against real captured markup.
   ============================================================ */

import { slug, SHAPE } from "../../tools/lib/identity.mjs";

/* Goodreads user ids are digits and Letterboxd usernames are handles. Both land
   in a URL, so anything else is refused rather than interpolated. */
const GOODREADS_ID = /^[0-9]{1,20}$/;
const LETTERBOXD_USER = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,30}$/;

export function feedUrls(sources = {}) {
  const userId = sources.goodreads?.userId;
  const username = sources.letterboxd?.username;

  if (userId && !GOODREADS_ID.test(String(userId))) {
    throw new Error(`${userId} is not a valid Goodreads user id`);
  }
  if (username && !LETTERBOXD_USER.test(String(username))) {
    throw new Error(`${username} is not a valid Letterboxd username`);
  }

  return {
    goodreads: userId ? `https://www.goodreads.com/review/list_rss/${userId}?shelf=read` : null,
    letterboxd: username ? `https://letterboxd.com/${username}/rss/` : null,
  };
}

/* ---------- cover URLs ---------- */

/* Goodreads serves a resized derivative whose size is baked into the filename
   (`._SY475_`, `._SX98_`). Drop the suffix and you get the original upload,
   which for most books is well over a thousand pixels wide. This is the whole
   reason book covers can be high resolution without an API key. */
export function fullSizeGoodreadsCover(url) {
  if (typeof url !== "string" || !url) return url;
  return url.replace(/\._S[XY]\d+_(\.[a-z]+)$/i, "$1");
}

/* Letterboxd bakes the crop into the path: `-0-600-0-900-crop.jpg`. Asking for
   1000x1500 is the largest that reliably comes back for every poster. */
export function biggerLetterboxdPoster(url) {
  if (typeof url !== "string" || !url) return url;
  return url.split("?")[0].replace(/-0-\d+-0-\d+-crop(\.[a-z]+)$/i, "-0-1000-0-1500-crop$1");
}

/* ---------- parsing ---------- */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };

function decode(text) {
  return String(text ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
      if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16));
      if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)));
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .trim();
}

const items = (xml) => String(xml ?? "").match(/<item[\s>][\s\S]*?<\/item>/g) || [];

/* Namespaced tags (`letterboxd:filmTitle`) are matched by their local name, so
   the caller does not have to care about the prefix the feed happens to use. */
function tag(item, name) {
  const found = new RegExp(`<(?:[a-z0-9]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-z0-9]+:)?${name}>`, "i").exec(item);
  return found ? decode(found[1]) : "";
}

const number = (value) => {
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/* Goodreads dates are RFC 822. Only the day is kept: the library's `finished`
   is a date, not a timestamp, and the feed's times are all midnight anyway. */
function goodreadsDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function parseGoodreads(xml) {
  return items(xml).map((item) => {
    const title = tag(item, "title");
    const pages = number(tag(item, "num_pages"));
    const author = tag(item, "author_name");
    const year = number(tag(item, "book_published"));
    /* Goodreads uses 0 for unrated. Writing that through would put a genuine
       zero-star rating on the site. */
    const rating = number(tag(item, "user_rating"));

    return {
      source: "goodreads",
      type: "book",
      title,
      creator: author,
      year,
      rating,
      finished: goodreadsDate(tag(item, "user_read_at")),
      coverUrl: fullSizeGoodreadsCover(tag(item, "book_large_image_url")),
      sourceUrl: tag(item, "link"),
      detail: pages ? `${pages} pages` : "Book",
      /* Deliberately not book_description: it is several paragraphs of
         marketing HTML, and facts are a two-column table. */
      facts: [
        ["Author", author || null],
        ["First published", year],
        ["Pages", pages],
        ["ISBN", tag(item, "isbn") || null],
      ].filter(([, value]) => value !== null && value !== ""),
    };
  }).filter((candidate) => candidate.title);
}

const POSTER = /<img src="([^"]+)"/i;

export function parseLetterboxd(xml) {
  return items(xml).map((item) => {
    const watched = tag(item, "watchedDate");
    /* The feed carries lists and standalone reviews too. A diary entry is the
       only thing with a watched date, and the only thing worth importing. */
    if (!watched) return null;

    const title = tag(item, "filmTitle");
    if (!title) return null;
    const poster = POSTER.exec(item)?.[1];
    const rating = Number(tag(item, "memberRating"));

    return {
      source: "letterboxd",
      type: "film",
      title,
      /* The feed has no director. Leaving it empty lets sync's own resolver
         fill it in rather than inventing an answer here. */
      creator: "",
      year: number(tag(item, "filmYear")),
      rating: Number.isFinite(rating) && rating > 0 ? rating : null,
      finished: watched,
      coverUrl: poster ? biggerLetterboxdPoster(decode(poster)) : "",
      sourceUrl: tag(item, "link"),
      detail: "Film",
      rewatch: tag(item, "rewatch").toLowerCase() === "yes",
      tmdbId: tag(item, "movieId") || null,
      facts: [["Released", number(tag(item, "filmYear"))]].filter(([, value]) => value !== null),
    };
  }).filter(Boolean);
}

/* ---------- diffing ---------- */

/* What the feeds offer, minus what the library already holds, minus the
   duplicates the feeds themselves contain. A rewatch is a second diary entry
   for the same film, so the newest wins and the rating shown is current. */
export function newCandidates(candidates, libraryItems) {
  const have = new Set(libraryItems.map((item) => item.id));
  const best = new Map();

  for (const candidate of candidates) {
    if (!SHAPE[candidate.type]) continue;
    const id = `${candidate.type}-${slug(candidate.title)}`;
    if (have.has(id)) continue;

    const previous = best.get(id);
    if (previous && String(previous.finished ?? "") >= String(candidate.finished ?? "")) continue;
    best.set(id, { ...candidate, id });
  }

  return [...best.values()];
}
