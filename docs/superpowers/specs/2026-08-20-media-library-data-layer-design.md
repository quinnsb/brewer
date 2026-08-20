# Media library — data layer design

Date: 2026-08-20
Status: proposed
Scope: **data layer only.** The renderer is deliberately undecided.

## Why this is scoped to the data layer

Three renderers were prototyped in `library-lab.html` (CSS per-type physics,
Three.js, and a tiered hybrid). All three read the same `data/library.json`
and none of them touch the sync pipeline. Swapping renderers three times
during the prototype required no change to the data.

That is the argument for building this half first. The renderer choice costs
a week if it turns out wrong. The catalogue, the cover art, and the writeups
are the durable work and they are renderer-independent.

## What this is

A build-time pipeline that turns Quinn's reading, listening, and viewing
history into a normalized catalogue with cached cover art, committed to the
repo and served as static files.

```
Goodreads RSS ─┐
Letterboxd CSV ├─→ sync ─→ normalize ─→ art fetch ─→ resize ─→ palette ─┐
iTunes         │                                                        ├─→ data/library.json
TMDB           │                                                        │   images/library/*
hand-authored ─┘                                          overrides ────┘
```

No serverless functions, no runtime API calls, no keys in the browser. The
site stays static. Hosting is Vercel, so functions remain available if a
later phase wants them, but nothing here requires one.

## Item schema

One flat array of plain objects. Modeled on the `CatalogBook` shape from
mintdotgg/complete-shelf, which pairs content, physical properties, and
palette on a single record.

```jsonc
{
  "id": "book-blood-meridian",     // <type>-<slug>, stable, URL-safe
  "type": "book",                  // book | album | film | other
  "shape": "spine",                // spine | sleeve | poster | tile
  "aspect": 0.66,                  // cover width / height

  "title": "Blood Meridian",
  "creator": "Cormac McCarthy",
  "year": 1985,
  "detail": "351 pages",

  "cover": "images/library/book-blood-meridian.webp",
  "coverWidth": 1400,
  "coverHeight": 2100,
  "browseAsset": "images/library/browse/book-blood-meridian.webp",
  "sourceUrl": "https://openlibrary.org/works/...",

  "palette": {                     // extracted, never hand-written
    "cover":  "#32342a",           // muted ground for spine / sleeve
    "accent": "#655e2d",           // foil, rules, hover state
    "ink":    "#f1ece3"            // whichever of cream/near-black clears contrast
  },

  "height": 0.94,                  // deterministic physical variation
  "thickness": 1.18,               // from a hash of `id`, stable across runs

  "starred": true,                 // editorial, from overrides
  "note": "…",                     // editorial, from overrides
  "rating": 5                      // from the export, where present
}
```

`height` and `thickness` are seeded from an FNV-1a hash of `id` through a
mulberry32 PRNG, so a given title always renders at the same width. This is
the trick complete-shelf uses to make a shelf look handled rather than
tidy, and it must be deterministic or the shelf reshuffles on every load.

## Source matrix

Each source below was tested against live endpoints during the prototype.
The failures are recorded because they are not obvious from the docs.

| Type | Metadata | Cover art | Notes |
|---|---|---|---|
| book | Goodreads shelf RSS | `book_large_image_url` from the same RSS | The export is both the list and the art source |
| album | iTunes Search `media=music&entity=album` | mzstatic, 1000×1000 | Keyless, fast, reliable |
| film | Letterboxd CSV + TMDB | TMDB `poster_path`, up to 2000px | Needs a free TMDB key |
| other | iTunes Search `media=podcast` | mzstatic, 1000×1000 | Keyless |

### Sources rejected, and why

- **Goodreads API** — shut down to new keys in 2020. Not available at any price.
- **Letterboxd API** — closed beta, invite only. The RSS feed carries only
  the most recent ~50 diary entries, so it cannot express a curated list.
- **iTunes `media=movie`** — returns `resultCount: 0` for every query
  tested. Apple appears to have dropped film search from the public
  endpoint. Do not build on it.
- **Wikipedia `pageimages`** — works for posters, but only with
  `pilicense=any`; the default `free` hides fair-use infobox images. Art is
  220–260px, which is thumbnail grade. Viable fallback, not a primary.
- **MusicBrainz / Cover Art Archive** — returned HTTP 503 repeatedly under
  normal, rate-limit-respecting use. Demoted to fallback behind iTunes.
- **Open Library** — good coverage, but covers are 185–334px. Fine at spine
  width, visibly soft when an item opens. Fallback only.

### The art quality decision

Cover art is a stated priority, and keyless sources cannot deliver it for
books and films. Both Mint reference projects sidestep this by generating
artwork procedurally; that option is not open here.

Therefore: **the exports are the primary art source.** Goodreads RSS carries
large cover URLs for the exact editions Quinn shelved, which is better than
any search can do, because it needs no fuzzy matching. TMDB covers films.

## Fuzzy search is banned in production

The prototype resolved titles by search and got this wrong in ways that
would be invisible at scale:

- "Burning" resolved to the Wikipedia article *Combustion*.
- "Paris Texas" and "The Master" hit disambiguation pages and returned nothing.
- "The Low End Theory" matched a different A Tribe Called Quest record.

Production must resolve by **stable ID** carried in the export (Goodreads
book ID, Letterboxd TMDB ID). Title search is permitted only for the
hand-authored `other` shelf, and every result must be logged for review.

## The editorial overlay

The single most important constraint: **a re-sync must never destroy
Quinn's writing.**

Synced data and editorial data live in separate files and are merged at
build time.

- `data/library.sync.json` — machine-owned. Overwritten wholesale on every
  run. Never hand-edited.
- `data/library.overrides.json` — human-owned. Never written by a script.
  Holds `starred`, `note`, curated `order`, and any corrected title,
  creator, or cover path.
- `data/library.json` — the merge product. Committed, and the only file a
  renderer reads.

```jsonc
// library.overrides.json
{
  "order": ["album-in-rainbows", "book-blood-meridian", "…"],
  "items": {
    "book-blood-meridian": {
      "starred": true,
      "note": "The one that made me stop trusting narrators.",
      "cover": "images/library/custom/blood-meridian-2100.webp"
    }
  }
}
```

Merge rule: override values win over synced values, field by field. An
override for an id that no longer exists in the sync is reported as a
warning, never silently dropped, because it usually means a title fell off
a shelf by accident.

Ordering is `unranked but sortable`: `order` sets the default curated
sequence, and the renderer offers title / creator / year as alternates.

## Image pipeline

28 covers came to 4.2MB unoptimized, which projects to roughly 22MB at 150
items. That is too much to commit. Every cover gets normalized:

1. **Full cover** — longest edge capped at 1400px, WebP quality 82.
   Lazy-loaded, only when an item is opened. Every item gets one.
2. **Browse asset** — eager, small, and its form depends on `shape`,
   because a "spine strip" is meaningless for an object that is never seen
   edge-on:
   - `shape: spine` (books) → the leftmost 15% of the cover, 200px tall.
     This is the sliver the shelf actually shows.
   - `shape: sleeve | poster | tile` (albums, films, podcasts) → the whole
     cover at 320px on its longest edge. These are browsed face-on, so the
     browse asset is a thumbnail, not a crop.

The two-tier split is the thing that makes 150+ items viable in either a
CSS or a WebGL renderer, and it is the same idea as complete-shelf's
texture atlas and the Squarespace shelf's `is-cover-deferred` lazy loading.

Target: under 4MB total for ~150 items.

Format note: Wikipedia serves PNGs with `.jpg` URLs, so the pipeline must
sniff the real format from magic bytes rather than trusting the extension.

## Palette extraction

Per item, from the normalized cover, via an 8×8 downsample:

- `cover` — mean of the 64 samples, multiplied by 0.72 so type has somewhere
  to sit. A 1×1 mean was tried first and produces muddy brown for almost
  every image; 8×8 preserves usable hue.
- `accent` — the most saturated sample, excluding anything below 0.12 or
  above 0.93 lightness, since those carry no hue.
- `ink` — cream (`#f1ece3`) or near-black (`#141210`), whichever has the
  higher WCAG contrast ratio against `cover`. Not a guess; computed.

Verified sane on real input: *In Rainbows* → `#ea7c2d`, Joni Mitchell's
*Blue* → `#002061`.

`sips` is used to decode, which ties the pipeline to macOS. Acceptable: this
is a local build step Quinn runs, not CI. If it ever needs to run on Linux,
swap in `sharp`.

## Secrets

The TMDB key is the only secret. It goes in a gitignored `.env` at the repo
root, read by the sync script through `process.env`. It is never committed,
never sent to the browser, and never passed on a command line. `.gitignore`
gains `.env`.

## Failure handling

The pipeline is run by hand and read by a human, so it optimizes for
legibility over resilience:

- Every network call retries three times with linear backoff.
- Failures are collected and printed as a summary at the end, never thrown
  away mid-run. A partial catalogue is written regardless.
- An item that resolves metadata but not art is kept, flagged
  `"artMissing": true`, and rendered with a baked typographic spine.
- The run exits non-zero if more than 10% of items fail, so a broken
  upstream is noticed rather than quietly shipped.

## Baked fallback art

Any item with no usable cover gets a generated spine: palette ground,
canvas cloth grain, accent rules, and the title set in Degular Display.
Proven in the WebGL prototype. This is what makes objects with no printed
spine work on a shelf at all, and it doubles as the missing-art fallback.

Note this inverts the reference projects: they generate art by default and
treat real covers as optional. Here real art is primary and generation is
the fallback.

## Out of scope

- The renderer. Deferred by decision on 2026-08-20.
- Per-item detail pages and their SEO.
- Any live or scheduled sync. This is run by hand when the shelves change.
- "Currently reading / recently watched." Possible later via RSS, but a
  curated library does not need it.

## Verification

- `node tools/library-sync.mjs` completes with a failure summary and a
  non-zero exit above the 10% threshold.
- Every item in `library.json` has a cover file that exists on disk and is
  a real image, checked by magic bytes.
- Re-running the sync does not change `note`, `starred`, or `order`.
- Total `images/library/` weight stays under 4MB.
- Palette contrast: every item's `ink` clears 4.5:1 against its `cover`.
