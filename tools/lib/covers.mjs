/* ============================================================
   COVERS — finding the best available artwork for one item

   Shared by tools/library-covers.mjs, which upgrades what is already on the
   shelf, and tools/library-add-books.mjs, which needs the same thing for
   something arriving for the first time. One place, so a book added today gets
   the cover an upgrade pass would have given it.

   Where the files come from, and why:

     books   iTunes' ebook catalogue, whose artwork serves at any size on
             request and which has nearly everything. Around 1300px.
     albums  the same trick against the music catalogue.
     films   TMDB, when TMDB_API_KEY is set. iTunes' movie search returns
             nothing at all now, for any title, and Wikipedia hosts posters at
             deliberately low resolution for fair use, so that ~250px file is
             the original and there is nothing bigger to fetch.
   ============================================================ */

const UA = "brewer-library-covers/0.1 ( https://www.quinnbrewer.com )";

/* JPEG and PNG dimensions straight from the header, so nothing has to be
   decoded or shelled out to just to find out how big a file is. */
export function imageSize(buffer) {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  for (let i = 2; i < buffer.length - 9; ) {
    if (buffer[i] !== 0xff) { i += 1; continue; }
    const marker = buffer[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5) };
    }
    i += 2 + buffer.readUInt16BE(i + 2);
  }
  return null;
}

export async function get(url, tries = 3) {
  let last;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`${response.status}`);
      return response;
    } catch (err) {
      last = err;
      if (attempt < tries - 1) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw last;
}

const words = (value) =>
  String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/* These catalogues search loosely, which is right for a person typing and wrong
   for a script installing a cover unattended: asking for Coloring Book by
   Chance the Rapper returned a TisaKorean single called Groceries, and The
   Dispossessed returned a different Le Guin novel. So the result has to prove
   it is the same work: every word of the wanted title must appear in the name
   that came back. "Moby-Dick" still matches "Moby Dick", and a subtitle or a
   series suffix is still fine, but a different book is not. */
export function titlesAgree(want, got) {
  const wanted = words(want).filter((word) => !["the", "a", "an"].includes(word));
  if (!wanted.length) return false;
  const found = new Set(words(got));
  return wanted.every((word) => found.has(word));
}

/* iTunes hands back a 100px thumbnail; the same URL serves any size, but how
   big "any size" actually is depends on the edition that was uploaded, and the
   search does not say. Taking the first match got Heart of Darkness at 665px
   when the same query also offered the same book at 1500px, so this returns
   every edition that agrees on the title and lets the caller measure a few. */
export async function itunesCovers({ title, creator }, media, limit = 12) {
  const term = encodeURIComponent(`${title} ${creator || ""}`.trim());
  const entity = media === "music" ? "&entity=album" : "";
  const payload = await (await get(
    `https://itunes.apple.com/search?term=${term}&media=${media}${entity}&limit=${limit}&country=US`
  )).json();

  const urls = [];
  for (const result of payload.results || []) {
    const name = result.collectionName || result.trackName;
    if (!result.artworkUrl100 || !titlesAgree(title, name)) continue;
    /* The title alone is not enough. "Solo Wurlitzer Electric Piano: Rob Arthur
       Performs Miles Davis' Kind of Blue" contains every word of "Kind of
       Blue", and it is not Kind of Blue. When the item names a creator, whoever
       the result is credited to has to be that creator. */
    if (creator && !creatorAgrees(creator, result.artistName)) continue;
    urls.push(result.artworkUrl100.replace(/\/\d+x\d+bb\./, "/2000x2000bb."));
  }
  return urls;
}

/* A surname is enough, and has to be: catalogues write "Ursula K. Le Guin",
   "Ursula Le Guin" and "Le Guin, Ursula K." for the same person. So the test is
   that some distinctive word of the wanted name appears in the credited one. */
export function creatorAgrees(want, got) {
  const wanted = words(want).filter((word) => word.length > 2);
  if (!wanted.length) return true;
  const found = new Set(words(got));
  return wanted.some((word) => found.has(word));
}

/* Kept for callers that only want one. */
export async function itunesCover(item, media) {
  const [first] = await itunesCovers(item, media, 5);
  return first ?? null;
}

/* TMDB's own search, matched on title and year so a remake does not win. */
export async function tmdbPoster({ title, year }) {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({ api_key: key, query: title });
  if (year) params.set("year", String(year));
  const payload = await (await get(`https://api.themoviedb.org/3/search/movie?${params}`)).json();

  for (const result of payload.results || []) {
    if (!result.poster_path || !titlesAgree(title, result.title)) continue;
    return `https://image.tmdb.org/t/p/original${result.poster_path}`;
  }
  return null;
}

const MEASURE_AT_MOST = 5;

/* Downloads and returns the bytes of the biggest edition that agrees on the
   title, and only if it beats `minWidth`; 0 accepts anything readable. */
export async function bestCover(item, { minWidth = 0 } = {}) {
  const attempts = [];
  if (item.type === "book") attempts.push(["iTunes", () => itunesCovers(item, "ebook")]);
  if (item.type === "album") attempts.push(["iTunes", () => itunesCovers(item, "music")]);
  if (item.type === "film") attempts.push(["TMDB", async () => [await tmdbPoster(item)]]);
  if (item.coverUrl) attempts.push(["source", async () => [item.coverUrl]]);

  const notes = [];
  for (const [name, resolve] of attempts) {
    let best = null;
    try {
      const urls = (await resolve()).filter(Boolean);
      if (!urls.length) { notes.push(`${name} had nothing`); continue; }

      /* Measuring costs a download each, so only the first few editions are
         weighed. They come back roughly best-match first, so the biggest of
         those is the right cover rather than merely a big one. */
      for (const url of urls.slice(0, MEASURE_AT_MOST)) {
        try {
          const buffer = Buffer.from(await (await get(url)).arrayBuffer());
          const size = imageSize(buffer);
          if (!size || size.width <= minWidth) continue;
          if (!best || size.width > best.size.width) best = { buffer, size, source: name, url };
        } catch { /* one bad edition is not a reason to abandon the rest */ }
      }
      if (best) return best;
      notes.push(`${name} offered nothing over ${minWidth}px`);
    } catch (err) {
      notes.push(`${name} failed: ${err.message}`);
    }
  }
  return { buffer: null, notes };
}
