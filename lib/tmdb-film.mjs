/* ============================================================
   TMDB — one film, looked up and dressed

   Lifted out of tools/library-add-films.mjs so the list importer can add a
   film the same way rather than growing a second, slightly different copy of
   it. Both callers want the same three things from TMDB: the genres, a poster,
   and the handful of facts the shelf shows.

   Posters are stored at w780 rather than `original`. The detail view is the
   only place the full file is used and it renders at well under 780px even on
   a large screen at 2x; `original` is nearer 2000px and a megabyte, which
   across a hundred films would put a hundred megabytes into the repository for
   pixels nothing ever displays. The 700px shelf thumb is generated from it.
   ============================================================ */

import { rawItemFor } from "./add-item.mjs";
import { get, imageSize, titlesAgree } from "../tools/lib/covers.mjs";

export const POSTER_SIZE = "w780";

/* TMDB's genre names, mapped onto the words the shelf already uses. Anything
   not listed keeps TMDB's own name, which is how Horror, War and the rest
   arrive. */
export const GENRE_ALIAS = {
  "Science Fiction": "Science fiction",
  History: "Historical",
  Music: "Musical",
};

export async function tmdbGenreNames(key) {
  const payload = await (await get(`https://api.themoviedb.org/3/genre/movie/list?api_key=${key}`)).json();
  return new Map((payload.genres || []).map((g) => [g.id, GENRE_ALIAS[g.name] || g.name]));
}

/* One search per film, matched on title and year so a remake does not win. */
export async function tmdbFilm(film, key) {
  const params = new URLSearchParams({ api_key: key, query: film.title });
  if (film.year) params.set("year", String(film.year));
  const payload = await (await get(`https://api.themoviedb.org/3/search/movie?${params}`)).json();

  for (const result of payload.results || []) {
    if (!result.poster_path || !titlesAgree(film.title, result.title)) continue;
    return result;
  }
  return null;
}

/* A film fetched by id rather than found by search. The two responses differ:
   a search result carries genre_ids, a film record carries genres as objects. */
export async function tmdbById(id, key) {
  const payload = await (await get(`https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}?api_key=${key}`)).json();
  if (!payload?.id) throw new Error(`TMDB has no film ${id}`);
  return { ...payload, genre_ids: (payload.genres || []).map((g) => g.id) };
}

/* The whole of one film: the match, its genres, its poster bytes and the
   catalogue item built from them. Throws with a reason a caller can print,
   because every one of these is a thing that can legitimately fail for a
   single film without the run being over.

   `tmdbId` skips the search, and with it the title check. That check is what
   stops a loose search installing the wrong poster, so it is not relaxed; but
   TMDB files a handful of films under a title nobody uses, and for those an
   explicit id is the honest answer rather than a looser rule for everything. */
export async function filmFromTmdb(film, key, genres, { tmdbId = null } = {}) {
  const match = tmdbId ? await tmdbById(tmdbId, key) : await tmdbFilm(film, key);
  if (!match) throw new Error("no TMDB match");
  if (!match.poster_path) throw new Error("TMDB has no poster");

  const names = (match.genre_ids || []).map((id) => genres.get(id)).filter(Boolean);
  if (!names.length) throw new Error("TMDB lists no genre");

  const buffer = Buffer.from(
    await (await get(`https://image.tmdb.org/t/p/${POSTER_SIZE}${match.poster_path}`)).arrayBuffer()
  );
  const size = imageSize(buffer);
  if (!size) throw new Error("poster unreadable");

  const rawItem = rawItemFor({
    type: "film",
    title: film.title,
    year: film.year ?? (match.release_date ? Number(match.release_date.slice(0, 4)) : null),
    detail: "Film",
    sourceUrl: `https://www.themoviedb.org/movie/${match.id}`,
    facts: [
      ["Released", match.release_date || null],
      ["TMDB rating", match.vote_average ? match.vote_average.toFixed(1) : null],
    ].filter(([, v]) => v !== null),
  });

  return { rawItem, genres: names, poster: buffer, size, match };
}
