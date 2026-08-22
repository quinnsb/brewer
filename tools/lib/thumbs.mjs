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

export const THUMB_WIDTH = 700;

export const thumbPath = (id) => `images/library/thumbs/${id}.jpg`;

/* mtimeMs carries sub-millisecond noise on some filesystems, and a cover that
   is byte-identical should stay a cache hit, so it is rounded. */
export function fingerprint(stat) {
  return `${stat.size}:${Math.round(stat.mtimeMs)}`;
}

/* Attaches the thumb path to every item that has one. An item with no thumb
   keeps only its cover, and every consumer falls back to that, so a missing
   derivative degrades to a heavy image rather than a broken one. */
export function applyThumbs(items, cache = {}) {
  return items.map((item) => {
    const entry = cache[item.id];
    if (!entry?.thumb) return item;
    return { ...item, thumb: entry.thumb };
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

    if (previous && previous.fingerprint === print && previous.thumb) {
      next[item.id] = previous;
      continue;
    }

    const target = thumbPath(item.id);
    try {
      const bytes = await encode(item.cover, target);
      next[item.id] = { fingerprint: print, thumb: target, bytes };
      made += 1;
      onLog?.(`  ${item.id.padEnd(46)} ${String(Math.round(bytes / 1024)).padStart(4)}KB`);
    } catch (err) {
      missed += 1;
      onLog?.(`  MISS ${item.id}: ${err.message}`);
    }
  }

  return { cache: next, made, missed };
}
