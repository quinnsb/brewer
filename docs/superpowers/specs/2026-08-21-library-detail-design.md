# Library detail view, and the pipeline behind it

Date: 2026-08-21
Status: approved, ready for planning

## Problem

The library detail overlay is structurally fine and content-starved. All 84 items
have `rating`, `reviewHtml`, `starred`, and `finished` empty, so every item shows
"No writeup yet." and no judgment of any kind. Every cover glows the same fallback
brown because `palette` is empty too, and that one is a bug rather than a gap.

The content pipeline to fix this already exists and is unused. `tools/library-build.mjs`
merges `content/library/<id>.md` (frontmatter plus markdown body) into `library.json`
via `mergeItem`, which already understands `rating`, `starred`, `finished`, and a
markdown body compiled to `reviewHtml`. The five notes on disk are metadata
corrections with empty bodies.

### The palette bug

`tools/library-colors.mjs` post-processes `data/library.json` to add `palette`.
`tools/library-build.mjs` regenerates `data/library.json` from `data/library.raw.json`.
So every build silently wipes the palette. Timestamps confirm it: colors last ran
Aug 20 15:13, build last ran Aug 21 10:19.

## Decisions

- Ratings are 0 to 5 in half steps, matching what Goodreads and Letterboxd export,
  so imported ratings carry over without translation.
- Absent content collapses silently. A reader never sees a placeholder.
- The overlay keeps its morph transition. It gains deep links rather than becoming
  a set of real pages.
- Palette folds into build so one command always produces a complete file.

## A. Pipeline

`library-colors.mjs` becomes `tools/lib/palette.mjs` plus a cache at
`data/library-palette.json`, keyed by item id and fingerprinted on the cover file's
size and mtime. `library-build.mjs` merges it in the way it already merges taxonomy
and listening.

An unchanged cover is a cache hit and costs no `sips` call, so build stays offline
and fast, which is what its header promises. Only a new or replaced cover pays.
`node tools/library-build.mjs` becomes the single command that produces a complete
`library.json`, and the clobbering bug is gone structurally rather than documented
around.

`mergeItem` gains rating validation: a finite number from 0 to 5 on a half step.
Anything else warns loudly and drops the value, matching how build already warns
about a note filename that matches no item id.

Tests: extend `tools/__tests__/merge.test.mjs` for rating validation, add
`tools/__tests__/palette.test.mjs` for cache hit, cache miss, and a changed cover.

## B. Copy column

Order, top to bottom:

1. Kicker (`Book 01 of 29`), unchanged
2. Title
3. Byline: creators (linked to catalog), year, finished
4. Verdict: rating, plus the star mark when starred
5. Writeup
6. Facts table
7. Media (album player and tracklist)
8. Source link
9. Navigation

Two substantive moves.

The rating moves up. `ratingDisplay` currently renders below the facts table, which
puts publisher and page count above Quinn's own judgment. The judgment is the reason
the page exists, so it sits directly under the byline. It collapses entirely when
the item is unrated.

The `media-detail-empty` branch is deleted. No writeup means no slot, and the facts
move up to close the gap.

The writeup gets a real prose treatment: the body face rather than the mono, larger,
about a 62 character measure. The facts table quiets down to compensate, and genres
become catalog links the way creators already are, via the existing `catalogHref`.

With every item currently unrated and unwritten, the column reads kicker, title,
byline, facts, source, navigation, with no holes.

## C. Navigation

Prev and next within type stay as they are, along with the existing keyboard
handling (Escape, left and right arrows), which needs no change.

Above the prev/next row, a related rail: up to four items sharing a creator or a
genre, shown as small covers. Clicking one swaps the overlay in place through the
`replace: true` path that `openDetail` already supports. Same creator ranks above
shared genre. The rail is absent when nothing qualifies.

## D. Deep links

Opening an item pushes `#item=<id>`. Closing pops back. A hash present on load opens
that item with the morph skipped, since there is no source node to morph from. The
back button closes the overlay. This is a thin wrapper over the existing `openDetail`
and `closeDetail`, not a rewrite of either.

## Out of scope

A write-capable admin portal and live sync from Goodreads, Letterboxd, and Spotify.
Those need secrets and auth decisions that have nothing to do with the detail view.
They get their own spec.

Decided already, so the next spec starts from here: the portal is a logged-in
`/admin` on quinnbrewer.com for adding items, rating them, and building lists.
Analytics is dropped. Since the site is static HTML in a GitHub repo, the shape
that fits is a git-based CMS: log in with GitHub, edits commit markdown to
`content/library/`, and the existing build turns it into `library.json`.

Notes on feasibility, recorded so the next spec does not relitigate them:

- Goodreads retired its public API in December 2020. The per-shelf RSS feed at
  `goodreads.com/review/list_rss/<userId>?shelf=read` still carries title, author,
  rating, date read, and cover.
- Letterboxd's API is approval-gated closed beta. The public feed at
  `letterboxd.com/<user>/rss/` gives recent diary entries only, so RSS keeps the
  data current and the CSV export backfills history.
- Spotify has a real documented API, and 25 albums already carry Spotify IDs.
- For a static site on GitHub, "live" realistically means a scheduled Action that
  runs the sync and commits the result. No keys reach the browser and a failed
  fetch cannot break the site.

## Success criteria

- `node tools/library-build.mjs` run twice in a row produces a `library.json` with
  a populated `palette` on every item both times.
- An item with a writeup and a rating renders both, with the rating above the writeup.
- An item with neither renders no placeholder and no empty space.
- A malformed rating in a note is dropped and warned about by name, not passed
  through silently.
- Opening an item changes the URL; reloading that URL opens the same item; back closes it.
- `node --test tools/__tests__/*.test.mjs` passes. (Node 25 treats a bare
  directory argument as a module, so the glob is required.)
