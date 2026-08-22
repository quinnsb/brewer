/* ============================================================
   THUMBS — a shelf-sized copy of every cover

   The covers are 1300 to 2000px because the detail view shows them large and
   because a grainy cover was the thing to fix. The shelves render them between
   130 and 260px. Serving the full file to a shelf meant a phone downloading
   40MB to draw a row of thumbnails, which is why covers stopped loading on
   mobile: the browser gives up long before the row is filled.

   So each cover gets one derivative at THUMB_WIDTH, used everywhere a cover is
   small: shelves, the hero ring, the catalogue grid, the list rails. The detail
   view keeps the full file, because that is the one place the resolution is the
   point.

   Same shape as palette.mjs: fingerprinted on the source file so an unchanged
   cover costs nothing, pure apart from the injected stat/encode, and the sips
   half stays in sips.mjs so this can be tested without spawning anything.
   ============================================================ */

/* Two sizes, because the covers are shown at two scales that are nowhere near
   each other. The catalog grid draws them around 190 to 260px wide, so 700
   still covers it on a 2x screen. The shelves draw them between 132 and 260px
   and the hero ring at 72px, and handing a 700px file to a 132px podcast tile
   is where most of the page weight was going. */
export const THUMB_WIDTH = 700;
export const SHELF_WIDTH = 320;

export const thumbPath = (id) => `images/library/thumbs/${id}.jpg`;
/* The same picture in webp, which is a little under half the jpeg at this size.
   The jpeg stays as the fallback source in the <picture>, so nothing breaks
   where webp is not decoded. */
export const thumbWebpPath = (id) => `images/library/thumbs/${id}.webp`;
/* Shelf sized, webp only: this exists to be small, and a browser old enough to
   need the jpeg can have the big one. */
export const shelfWebpPath = (id) => `images/library/thumbs/${id}-sm.webp`;

/* mtimeMs carries sub-millisecond noise on some filesystems, and a cover that
   is byte-identical should stay a cache hit, so it is rounded. */
export function fingerprint(stat) {
  return `${stat.size}:${Math.round(stat.mtimeMs)}`;
}

/* Attaches the thumb paths to every item that has them. An item with no thumb
   keeps only its cover, and every consumer falls back to that, so a missing
   derivative degrades to a heavy image rather than a broken one. */
export function applyThumbs(items, cache = {}) {
  return items.map((item) => {
    const entry = cache[item.id];
    if (!entry?.thumb) return item;
    const next = { ...item, thumb: entry.thumb };
    if (entry.thumbWebp) next.thumbWebp = entry.thumbWebp;
    if (entry.shelfWebp) next.shelfWebp = entry.shelfWebp;
    return next;
  });
}

/* Encodes only the covers whose fingerprint moved, and forgets entries for
   items that are gone. Returns a fresh cache rather than mutating the old one. */
export async function refreshThumbs(items, cache = {}, { stat, encode, onLog } = {}) {
  const next = {};
  let made = 0;
  let missed = 0;

  for (const item of items) {
    const previous = cache[item.id];
    let print = null;
    try {
      print = fingerprint(await stat(item.cover));
    } catch {
      /* A cover that cannot be stat'd is a sync problem, not a build problem.
         No thumb means the full cover is used, which still renders. */
      missed += 1;
      onLog?.(`  MISS ${item.id}: cover not readable`);
      continue;
    }

    /* thumbWebp has to be present as well, or a cache written before webp
       existed would be reused forever and that cover would never get one. */
    if (
      previous && previous.fingerprint === print &&
      previous.thumb && previous.thumbWebp && previous.shelfWebp
    ) {
      next[item.id] = previous;
      continue;
    }

    const targets = {
      jpeg: thumbPath(item.id),
      webp: thumbWebpPath(item.id),
      shelf: shelfWebpPath(item.id),
    };
    try {
      const bytes = await encode(item.cover, targets);
      next[item.id] = {
        fingerprint: print,
        thumb: targets.jpeg,
        thumbWebp: targets.webp,
        shelfWebp: targets.shelf,
        bytes: bytes.jpeg,
        webpBytes: bytes.webp,
        shelfBytes: bytes.shelf,
      };
      made += 1;
      onLog?.(
        `  ${item.id.padEnd(42)} ${String(Math.round(bytes.jpeg / 1024)).padStart(4)}KB jpeg` +
        ` ${String(Math.round(bytes.webp / 1024)).padStart(4)}KB webp` +
        ` ${String(Math.round(bytes.shelf / 1024)).padStart(3)}KB shelf`
      );
    } catch (err) {
      missed += 1;
      onLog?.(`  MISS ${item.id}: ${err.message}`);
    }
  }

  return { cache: next, made, missed };
}
