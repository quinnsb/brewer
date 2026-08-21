/* ============================================================
   PALETTE — per-cover colour, cached so build stays offline and fast

   Sampling a cover means shelling out to macOS `sips`, which is far too slow
   to repeat for 84 unchanged files on every build. So the expensive result is
   cached in data/library-palette.json, keyed by item id and fingerprinted on
   the cover file. Build recomputes only the covers that actually moved.

     palette.cover     muted mean, used as the spine / sleeve ground
     palette.accent    most vibrant sample, used for foil + rules
     palette.ink       black or cream, whichever clears contrast on `cover`

   The sips half lives in sips.mjs. Everything here is pure and injectable so
   it can be tested without touching a disk or spawning a process.
   ============================================================ */

export const FALLBACK_PALETTE = { cover: "#33302b", accent: "#7a736a", ink: "#f1ece3" };

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");

/* WCAG relative luminance, used to pick a legible ink colour. */
function luminance(r, g, b) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

export function derivePalette(px) {
  const n = px.length;
  const mean = px.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n, a[2] + p[2] / n], [0, 0, 0]);

  /* Vibrant = highest saturation among pixels that are not near-black or
     near-white, since those carry no usable hue. */
  let best = null, bestScore = -1;
  for (const p of px) {
    const [, s, l] = rgbToHsl(...p);
    if (l < 0.12 || l > 0.93) continue;
    const score = s * (1 - Math.abs(l - 0.5));
    if (score > bestScore) { bestScore = score; best = p; }
  }
  const accent = best ?? mean;

  /* Darken the mean so spine type has somewhere to sit. */
  const cover = mean.map((c) => c * 0.72);
  const lum = luminance(...cover);
  const ink = contrast(lum, luminance(241, 236, 227)) >= contrast(lum, luminance(20, 18, 16))
    ? "#f1ece3"   /* site cream */
    : "#141210";

  return { cover: hex(...cover), accent: hex(...accent), ink };
}

/* mtimeMs carries sub-millisecond noise on some filesystems, and a cover that
   is byte-identical should stay a cache hit, so it is rounded. */
export function fingerprint(stat) {
  return `${stat.size}:${Math.round(stat.mtimeMs)}`;
}

/* Pure: takes items and a cache, returns new items carrying colour. Anything
   the cache does not know about gets the fallback rather than `undefined`, so
   the page never has to guard for a missing palette. */
export function applyPalette(items, cache = {}) {
  return items.map((item) => {
    const entry = cache[item.id];
    if (!entry) return { ...item, palette: FALLBACK_PALETTE };
    return {
      ...item,
      width: entry.width,
      height_px: entry.height_px,
      palette: entry.palette,
    };
  });
}

/* Measures only the covers whose fingerprint moved, and prunes entries for
   items that are gone. Returns a fresh cache rather than mutating the old one. */
export async function refreshPaletteCache(items, cache = {}, { stat, measure, onLog } = {}) {
  const next = {};
  let computed = 0;
  let missed = 0;

  for (const item of items) {
    const previous = cache[item.id];
    let print = null;
    try {
      print = fingerprint(await stat(item.cover));
    } catch {
      /* A cover that cannot even be stat'd is a sync problem, not a build
         problem. Fall back and keep going. */
      next[item.id] = { fingerprint: null, width: 0, height_px: 0, palette: FALLBACK_PALETTE };
      missed += 1;
      onLog?.(`  MISS ${item.id}: cover not readable`);
      continue;
    }

    if (previous && previous.fingerprint === print) {
      next[item.id] = previous;
      continue;
    }

    try {
      const { width, height_px, px } = await measure(item.cover);
      next[item.id] = { fingerprint: print, width, height_px, palette: derivePalette(px) };
      computed += 1;
      onLog?.(`  ${item.id.padEnd(46)} ${width}x${height_px}  ${next[item.id].palette.cover}`);
    } catch (err) {
      next[item.id] = { fingerprint: null, width: 0, height_px: 0, palette: FALLBACK_PALETTE };
      missed += 1;
      onLog?.(`  MISS ${item.id}: ${err.message}`);
    }
  }

  return { cache: next, computed, missed };
}
