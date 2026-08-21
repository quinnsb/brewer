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

/* iTunes hands back a 100px thumbnail; the same URL serves any size. */
export async function itunesCover({ title, creator }, media) {
  const term = encodeURIComponent(`${title} ${creator || ""}`.trim());
  const entity = media === "music" ? "&entity=album" : "";
  const payload = await (await get(
    `https://itunes.apple.com/search?term=${term}&media=${media}${entity}&limit=5&country=US`
  )).json();

  for (const result of payload.results || []) {
    const name = result.collectionName || result.trackName;
    if (!result.artworkUrl100 || !titlesAgree(title, name)) continue;
    return result.artworkUrl100.replace(/\/\d+x\d+bb\./, "/2000x2000bb.");
  }
  return null;
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

/* Downloads and returns the bytes only if the artwork is genuinely bigger than
   what is already there; `minWidth` of 0 accepts anything readable. */
export async function bestCover(item, { minWidth = 0 } = {}) {
  const attempts = [];
  if (item.type === "book") attempts.push(["iTunes", () => itunesCover(item, "ebook")]);
  if (item.type === "album") attempts.push(["iTunes", () => itunesCover(item, "music")]);
  if (item.type === "film") attempts.push(["TMDB", () => tmdbPoster(item)]);
  if (item.coverUrl) attempts.push(["source", () => item.coverUrl]);

  const notes = [];
  for (const [name, resolve] of attempts) {
    try {
      const url = await resolve();
      if (!url) { notes.push(`${name} had nothing`); continue; }
      const buffer = Buffer.from(await (await get(url)).arrayBuffer());
      const size = imageSize(buffer);
      if (!size) { notes.push(`${name} sent an unreadable image`); continue; }
      if (size.width <= minWidth) { notes.push(`${name} offered only ${size.width}px`); continue; }
      return { buffer, size, source: name, url };
    } catch (err) {
      notes.push(`${name} failed: ${err.message}`);
    }
  }
  return { buffer: null, notes };
}
