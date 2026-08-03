# The Forgotten Initiative — Design System

Extracted July 28, 2026. Everything here comes from TFI's own material. Nothing
is invented.

## How it was sourced

**Color** was sampled from `images/projects/the-forgotten-initiative/logo-horizontal.png`
by opaque-pixel frequency analysis (alpha > 230), with the mark and the
wordmark cropped apart first so the wordmark's single flat navy didn't drown
out the mark's palette.

**Assets and copy** came from theforgotteninitiative.org, filtered to
`/wp-content/uploads/` paths dated 2021 through 2024/05 — the window matching
Quinn's tenure (June 2021 – March 2024).

> The Wayback Machine was the obvious source and turned out to be unavailable:
> `web.archive.org` is blocked. It wasn't needed. TFI runs WordPress, uploads
> are date-stamped in the URL, and the Foster Care & The Church page still
> serves its original 2024 files. **The live site is its own archive.** Deep
> pages keep old assets long after a homepage redesign.

## Palette

| Token | Hex | Where it came from |
|---|---|---|
| `--tfi-ink` | `#063042` | Wordmark. 10,150 px of a single flat navy. |
| `--tfi-gold` | `#fdb414` | Mark, horizontal bar. |
| `--tfi-mint` | `#cae4db` | Mark, vertical bar. |
| `--tfi-tan` | `#d1c7bb` | Mark, diagonal bar. |
| `--tfi-gold-deep` | `#b28d35` | Sampled where gold and tan cross. |
| `--tfi-sage` | `#aab9a8` | Sampled where mint and tan cross. |

Two corrections to values previously in `tfi-case.css`, which had been set by
eye:

- `--tfi-navy: #123440` → the real navy is `#063042`
- `--tfi-yellow: #ffb61c` → the real gold is `#fdb414`

Both legacy tokens are retired. `--tfi-navy` and `--tfi-yellow` no longer exist.

### One ordering bug worth remembering

`tfi-case.css` loads after `tfi-brand.css` and used to redefine `--tfi-ink` as
`#17171b`. The later definition silently won, quietly reverting the brand navy
to near-black everywhere it was used. Body-copy color is now `--tfi-text`, kept
deliberately separate: a reading color is not a brand color.

## The mark

Three bars crossing at center — gold horizontal, mint vertical, tan at −45° —
with the intersections showing real multiply results.

Reproduced two ways:

- **CSS**: `.tfi-mark` in `tfi-brand.css`, three layers with `mix-blend-mode: multiply`.
- **SVG**: `tools/gen-tfi-assets.py`, using **explicit clipped geometry** with
  the sampled overlap colors instead of blend modes.

The SVG version avoids `mix-blend-mode` on purpose. Browsers support it, but
cairosvg and most non-browser renderers ignore it, so blended artwork can't be
verified outside a browser and may surprise a print RIP. Explicit geometry
renders identically everywhere.

Derived overlap values, for consistency in new artwork:

- gold × mint — `#c8a111`
- gold × mint × tan — `#a47e0c`

## Typography

TFI's wordmark is a bold neo-grotesque. Generated SVGs use
`Helvetica Neue, Helvetica, Arial` — licensed faces don't load inside an SVG
referenced through `<img>` and would silently fall back to Times.

Page chrome keeps the portfolio's own **Degular Display** and **P22 Mackinac Pro**.

## Generated assets

`tools/gen-tfi-assets.py` emits all 17 SVGs into
`images/projects/the-forgotten-initiative/generated/`. Roughly 80 KB for the
whole set. Rerun it after any color or copy change — the script is the source
of truth, not the files.

```
python3 tools/gen-tfi-assets.py
```

### Seven of them are no longer on the page

`mark-study`, `type-specimen`, `color-system`, `social-campaign`,
`episode-system`, `campaign-detail`, and `signage` were cut. They presented a
brand system — a mark study, a type specimen, a colour palette — as Quinn's
work, and he did not brand TFI. He produced communications for it. The files
and their generator functions are still here, unreferenced, in case any of
them is worth rebuilding around something real.

### Taste rules the generator follows

Studied from Smith & Diction, Pentagram, and Trust Design Shop:

- Identity work is shown as **physical objects** — a book with a spine and a
  cast shadow, a hanging banner, printed chips — not flat diagrams.
- **One idea per asset**, set large. Scale over explanation.
- Two stacked drop shadows (one broad, one tight) read as a real object; a
  single shadow reads as a filter.
- **Banned:** numbered step boxes, bullet lists, progress bars, icon grids.
  That is consultancy-deck vocabulary and it is the default failure mode.

Trust Design Shop is worth noting directly: they use Degular and Mackinac, and
their footer reads "We'd love to chat about your design needs / Let's Talk Shop."
This portfolio is already built on that model.

## Integration rules

- `object-fit: contain` for generated SVG, `cover` for photographs. Vector work
  is composed edge to edge; cropping cuts the mark or the caption off.
- Each slot's background is set to its artwork's own ground color, so the
  letterboxing `contain` introduces is invisible.
- `tfi-brand.css` must load **before** `tfi-case.css`.

## Real files on the page

- Three photographs Quinn already had on disk: `featured-station-film-still.webp`,
  `family-at-home.jpg`, and the hero.
- `podcast-cover.webp` — the released Forgotten Podcast cover.
- Two YouTube embeds: the launch film `I0SMjsU7cxo` and episode `iiVQAdYQBpI`.
  Both are facades — poster plus play button, iframe injected on click.

### Where the podcast cover came from

The show's own RSS feed. `tools/gen-tfi-assets.py` used to draw a stand-in
cover, and it was a plausible invention rather than the artwork that shipped.
The real file was two hops away:

```
itunes.apple.com/search?term=...&entity=podcast   ->  feedUrl
theforgottenpodcast.libsyn.com/rss                ->  <itunes:image href="...">
```

That yields `The-Forgotten-Podcast-Cover-July-2022.jpg` at 2000×2000 — dated
inside Quinn's tenure — committed here at 1600px as WebP, 76 KB. Worth
remembering as a pattern: **a podcast feed publishes its own artwork at full
resolution**, and Apple's lookup API will hand you the feed URL for any show.
TFI's own site and Spotify both serve only a 640px copy, so the feed is the
better source, not the fallback.

The generated stand-in was deleted rather than kept as a backup. A case study
should show what shipped.

## What is still not real

The identity, campaign, guide, and production assets are original design work
built from TFI's real brand data — accurate to the identity, but presentation
design, not photographs of the printed deliverables.

To go further, the highest-value additions would be:

1. Original files for the Foster Care & The Church participant guide.
2. Production photography from the Kentucky / Florence Baptist shoot.
3. Frames pulled from the launch film — unambiguously Quinn's own work.
