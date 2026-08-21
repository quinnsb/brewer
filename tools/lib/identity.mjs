/* ============================================================
   IDENTITY — how an item gets its id, its shape, and its shelf geometry

   Shared by library-sync.mjs and the admin's add path. Both have to produce
   byte-identical records for the same title, or an item added in the admin
   would jump on the shelf the first time sync ran.
   ============================================================ */

export const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/* Shelf physics differ per type, so each carries its own aspect + geometry.
   `shape` is what the renderers switch on. */
export const SHAPE = {
  book:  { shape: "spine",  aspect: 0.66 },
  album: { shape: "sleeve", aspect: 1.0  },
  film:  { shape: "poster", aspect: 0.68 },
  other: { shape: "tile",   aspect: 1.0  },
};

export const TYPES = Object.keys(SHAPE);

/* Deterministic pseudo-random from id, so spine widths are stable
   across runs. Same trick complete-shelf uses (fnv1a + mulberry32). */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function itemId(type, title) {
  return `${type}-${slug(title)}`;
}

/* The two numbers the shelf uses to lay an object out. Derived from the id
   alone, so they never move once the id is settled. */
export function shelfGeometry(id) {
  const rand = mulberry32(fnv1a(id));
  return {
    height: Number((0.45 + rand() * 0.55).toFixed(3)),
    thickness: Number((0.6 + rand() * 0.9).toFixed(3)),
  };
}
