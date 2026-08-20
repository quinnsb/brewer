# Library page — renderer and page design

Date: 2026-08-20
Status: approved
Scope: **the public page.** Companion to
`2026-08-20-media-library-data-layer-design.md`, which covers the catalogue
pipeline. That spec deliberately left the renderer undecided. This one decides
it and specifies the page built on top.

## Decision: renderer A

`library-lab.html` prototyped three renderers. **A (per-type CSS physics)
wins.** B (Three.js) and C (tiered) are not carried forward.

C was never really a third renderer. Its header comment claims "CSS index +
a WebGL hero for starred items," but `buildTiered` touches no Three.js — it
re-dispatches A's own builders on `starred` instead of on `type`. The
experiment it described was never actually run, so there is nothing to lose
by dropping it.

`library-lab.html` stays in the repo untouched as a record of the comparison.
The new page does not share code with it.

## What this page is

A standalone `library.html`. It does **not** use the site's header, footer, or
menu dock, and does not import `css/styles.css`. It may end up on a subdomain,
so it must move by copying files.

```
library.html
css/library.css
js/library.js         shelves + expand-in-place detail
js/library-hero.js    hero animation
data/library.json     generated — never hand-edited
content/library/*.md  reviews — hand-written
tools/library-sync.mjs    network: metadata + cover art (modified)
tools/library-build.mjs   local: merges sync output + markdown (new)
```

No build step, no bundler, no framework. Plain HTML, CSS, and ES2020 in
`<script>` tags, matching the rest of the repo. `tools/*.mjs` are run by hand
with `node`, as they already are.

## Visual direction: Archive

| Token | Value | Use |
|---|---|---|
| `--lib-bg` | `#0b0b0c` | page ground |
| `--lib-fg` | `#d8d6d1` | body text |
| `--lib-dim` | `rgba(216,214,209,.52)` | secondary text |
| `--lib-line` | `rgba(216,214,209,.18)` | hairline rules |
| `--lib-accent` | `#e8531c` | the only accent |

Type: **Aeonik** (`fonts/Aeonik-{Regular,Medium}.otf`) for headers, **Space
Mono** for labels and metadata, **Degular** for body copy and spine
typography. All self-hosted except Space Mono, which the site already pulls
from Google Fonts.

Hairline rules above each shelf label. No cards, no shadows on chrome, no
rounded containers. Cover art is the only saturated color on the page apart
from the accent.

## Hero

A vanilla-JS port of a scroll-driven flip-card animation. Original reference
was React + Framer Motion + Tailwind; this repo has none of those, and adding
a toolchain for one hero was rejected. Springs, staggering, and the 3D flip
are all reproducible with `requestAnimationFrame`, CSS transforms, and a small
spring integrator.

### Cards

All 28 library items, using their real cover art. Not stock photography — the
hero is made of the thing the page is about.

**Cards are square**, 72×72 at rest, `object-fit: cover`. Album art fits
natively; books and posters center-crop. Uniform dimensions keep the arc math
trivial and the arc rhythm even.

Each card flips on hover (`rotateY(180deg)`, `backface-visibility: hidden`).
The back face carries title, creator, and year in Space Mono on
`--lib-bg` — not a generic "View Details". Clicking a card scrolls to that
item on its shelf and opens it.

### Phases

1. **scatter** — cards start at random offsets, `opacity: 0`, `scale: .6`
2. **line** — at 500ms, cards animate to a horizontal row
3. **circle** — at 2500ms, cards settle into a ring
4. **arc** — driven by scroll: the ring morphs to a wide bottom arc, cards
   scaling up as they go

Phases 1–3 are time-driven on load. Phase 4 is scroll-driven.

### Scroll behavior

**The hero does not hijack the wheel.** The reference implementation calls
`preventDefault()` on a 3000px virtual scroll. That would trap a visitor in
the hero for a long trackpad haul before they reach any shelf, and would
compete for the same gesture as the horizontally-scrolling shelves below.

Instead: the hero is a `100vh` sticky section inside a `200vh` track. Morph
progress is `clamp(scrollY / viewportHeight, 0, 1)` — exactly one viewport of
real scrolling from ring to finished arc — read from a `scroll` listener
throttled to `requestAnimationFrame`. Past that point the sticky section
releases and the shelves scroll up normally. Native scrolling throughout:
keyboard, trackpad, and touch all work without special handling.

Mouse parallax translates the arc horizontally by up to ±100px, spring-damped.

### Headline

Left-justified on the same container grid as the shelves — not centered as in
the reference.

```
You are what you [read | listen to | watch | play]
```

The verb rotates with a **staggered character slide**: outgoing characters
translate up and out, incoming characters rise from below, staggered ~24ms
left to right, `cubic-bezier(.22,1,.3,1)` over ~440ms, holding ~2200ms.

Two implementation requirements, both learned from prototyping:

1. **The stem must not move.** Do not use a layout-animation approach that
   re-centers the line when the verb changes width. `You are what you` is
   pinned; the verb slot grows rightward.
2. **The outgoing word must leave the flow.** Set it to `position: absolute`
   at the moment of swap, or its characters keep their width and the verb
   visibly drifts right mid-transition.

Each character sits in an `overflow: hidden` mask with `padding-bottom: .14em`
so descenders are not clipped. A visually-hidden element carries the full
current sentence for screen readers.

## Shelves

Four physics, one per media type, carried over from renderer A:

| Type | Treatment |
|---|---|
| book | spines standing on a shelf |
| album | front-facing, leaned, in a crate with floor, lip, and back wall |
| film | posters bottom-aligned in a rack |
| other | flat square tiles |

All lab chrome is dropped: renderer tabs, the physics dropdown, the
spine-label checkbox, and the commentary blocks.

### Spines are generated, not cropped

Today `.spine` renders the front cover at `height: 100%; width: auto` inside a
15–32px `overflow: hidden` box, showing the leftmost ~18% of the jacket. That
is a crop, not a spine.

No keyless API serves book spine artwork — Open Library, iTunes, Cover Art
Archive, and Wikipedia are all front-cover-only. So spines are **generated**:

- ground: `palette.cover`; text: `palette.ink`; rules: `palette.accent`
- title in Degular Semibold ~12.5px, author below in caps ~9.5px, both set
  `writing-mode: vertical-rl` (reads top-to-bottom, US convention)
- accent rule 2px inset 18% at top and bottom
- width `21 + thickness * 19`, height `212 + height * 74`, both from the
  deterministic per-id values already in the catalogue, so a title sits at the
  same size on every reload
- edge lighting via `inset` box-shadows on both sides for the joint and page block

The front cover is still used everywhere else, including the expanded state.

### Film rack straightens

Remove the `((item.id.length * 7) % 5) - 2` deterministic lean. Posters sit
bottom-aligned and upright.

## Expand-in-place detail

Clicking an item expands it into a spread on its own shelf; neighbors slide
aside. The cover morphs from spine width to full jacket in the same motion.

Built on the `flex-basis` transition already proven in the lab, extended to
reveal review content, with one shared `cubic-bezier(.16,1,.3,1)` across the
expansion and the content arrival so it reads as a single gesture rather than
two stacked animations.

- one item open at a time, per shelf and across shelves
- collapse on second click, on click outside, or on Escape
- expanded content: cover, title, creator, year, your review, and a
  `sourceUrl` link
- items without a markdown file expand to metadata only

## Content pipeline

`library-sync.mjs` currently rebuilds `items` from scratch and overwrites
`data/library.json` wholesale, resetting `starred: false, note: null` on every
run. Any review written into that file is destroyed by the next sync. The fix
is to split the network job from the merge job:

```
tools/library-sync.mjs   → data/library.raw.json   (network; slow; occasional)
content/library/<id>.md  → hand-written            (reviews + overrides)
                    ↓
tools/library-build.mjs  → data/library.json       (local; fast; safe)
```

`library-sync.mjs` never writes `library.json` again, so it cannot clobber
writing. `library-build.mjs` is offline and safe to run on every edit.

### Review file format

```markdown
---
starred: true
finished: 2026-03
title: Paris, Texas
creator: Wim Wenders
year: 1984
---

Wenders shoots the desert like it owes him something.
```

Frontmatter keys are all optional. `title`, `creator`, and `year` override the
synced values; everything else falls through. The body is markdown, rendered
to HTML at build time by `library-build.mjs` (a minimal renderer covering
paragraphs, emphasis, and links — no dependency).

### Metadata corrections this unblocks

The synced catalogue has known-bad records, all from resolver misses:

| Item | Problem |
|---|---|
| `film-moonlight` | resolved the astronomical article, not the 2016 film: cover is a photo of the moon, `creator: "Unknown"`, `year: null` |
| `film-chungking-express` | cover is a text playbill, not the poster |
| `film-paris-texas-film` | title carries Wikipedia's `(film)` disambiguator |
| `film-burning-2018-film` | title carries `(2018 film)` |
| `film-the-master-2012-film` | title carries `(2012 film)` |
| `book-the-left-hand-of-darkness` | creator includes the introduction writer, "Ursula K. Le Guin & Charlie Jane Anders" |

Text is fixed by frontmatter overrides.

Bad cover images need their own path, for the same reason reviews do:
`download()` writes with `createWriteStream(dest)` and no existence check, so
anything hand-placed in `images/library/` is destroyed by the next sync. Manual
covers therefore live in **`images/library/overrides/<id>.jpg`**, which
`library-sync.mjs` never writes. `library-build.mjs` prefers an override when
one exists and falls back to the synced file otherwise.

The rule is consistent across the pipeline: generated artifacts and
hand-authored ones never share a path.

## Motion and accessibility

Under `prefers-reduced-motion: reduce`:

- the hero skips scatter/line/circle and renders directly at its resting arc
- mouse parallax is disabled
- the verb stops rotating and shows the first verb
- detail expansion is instant

Otherwise:

- every shelf item is a real `<button>` with an `aria-label`
- left/right arrows move focus along a shelf; Escape collapses
- focus-visible outlines in `--lib-accent`
- the rotating verb exposes the full sentence to screen readers via a
  visually-hidden element, so assistive tech reads a sentence rather than a
  stream of characters
- cover `<img>` are `alt=""` and `loading="lazy"`; the accessible name lives
  on the button

## Out of scope

No sort controls, no filtering, no search, no ratings UI, no tags. Twenty-eight
items do not need them, and all of them are additive once the shelves exist.

No WebGL. No React, Tailwind, TypeScript, or bundler.
