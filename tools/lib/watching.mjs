/* ============================================================
   WATCHING — the trailer that belongs to a film

   The mirror of listening.mjs. That file maps an album id to a Spotify album
   id; this one maps a film id to a YouTube video id, and the detail panel
   embeds it the way the album panel embeds a record.

   The ids live in data/library-watching.json, filled by
   tools/library-trailers.mjs from TMDB. Kept out of the item itself for the
   same reason the Spotify ids are: sync rebuilds items from the catalogues and
   would drop anything it does not own.
   ============================================================ */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function applyWatching(items, watching = {}) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const unknown = Object.keys(watching).filter((id) => !itemsById.has(id));
  if (unknown.length) throw new Error(`Watching data contains unknown item ids: ${unknown.join(", ")}`);

  return items.map((item) => {
    const trailerId = watching[item.id];
    if (!trailerId) return item;
    if (item.type !== "film") throw new Error(`Trailer id assigned to non-film item: ${item.id}`);
    /* An id that is not a YouTube id would become a src attribute pointing at
       who knows what, so it is refused rather than interpolated. */
    if (!YOUTUBE_ID.test(trailerId)) throw new Error(`Invalid YouTube video id for ${item.id}`);
    return {
      ...item,
      trailerId,
      trailerUrl: `https://www.youtube.com/watch?v=${trailerId}`,
      /* nocookie, and no related videos at the end: this is a trailer on a
         personal shelf, not a route into YouTube. */
      trailerEmbedUrl: `https://www.youtube-nocookie.com/embed/${trailerId}?rel=0&modestbranding=1`,
    };
  });
}
