# Handoff: library page

**Repo:** `/Users/quinnbrewer/portfolio4` · branch `main` · working tree clean
**Last commit:** `fcf45b4` "Fit the hero arc to the viewport on every screen size"

Read these two first, in order. They are the source of truth and both are committed:

- `docs/superpowers/specs/2026-08-20-library-page-design.md` — the design and why each decision was made
- `docs/superpowers/plans/2026-08-20-library-page.md` — the task-by-task plan

## What this is

A standalone `library.html` presenting Quinn's 28-item media library as
per-type physical shelves, with a scroll-driven hero. It deliberately does
**not** use the main site's header, footer, menu dock, or `css/styles.css` —
it may move to a subdomain, so it has to travel by copying files.

## Hard constraints (do not violate)

1. **No dependencies.** No `package.json`, no bundler, no framework, no
   TypeScript, no Tailwind. Static HTML + CSS + native ES modules only. The
   hero was ported from a React/Framer/Tailwind component *specifically* to
   avoid introducing a toolchain. Do not reintroduce one.
2. **`data/library.json` is generated. Never hand-edit it.**
3. **Generated and hand-authored files never share a path.** See pipeline below.
4. **No em dashes in user-facing copy** (project-wide rule, see
   `~/.claude/projects/-Users-quinnbrewer-portfolio4/memory/humanizer-copy-style.md`).
5. Every animation needs a `prefers-reduced-motion: reduce` resting state.

## Local dev

```bash
python3 -m http.server 4180
```

Then open `http://localhost:4180/library.html`. There is a `.claude/launch.json`
entry named `portfolio` for tools that read it. Do not run dev servers any
other way if your tool has a preview mechanism.

Tests (Node 25, built-in runner, zero deps):

```bash
node --test tools/__tests__/*.test.mjs
```

Currently **29 tests, all passing**. Note: the directory form
(`node --test tools/__tests__/`) misbehaves on Node 25; use the glob.

## Architecture

```
library.html            page shell, two mount points: #hero-stage, #shelves
css/library.css         all styling, Archive direction
js/lib/geometry.js      PURE math, no DOM. Imported by browser AND node:test.
js/library.js           shelves + expand-in-place detail
js/library-hero.js      hero animation + rotating headline
tools/lib/*.mjs         frontmatter, markdown, merge (unit tested)
tools/library-sync.mjs  network: metadata + cover art
tools/library-build.mjs local: merge into data/library.json
```

`js/library.js` dynamically imports `js/library-hero.js`, which imports
`openItem` back from `js/library.js`. That circular ESM edge **works** because
the import is deferred until after the module body evaluates. If you refactor
`main()`, keep the hero import dynamic or it will break.

### Content pipeline

```
tools/library-sync.mjs   → data/library.raw.json   (network, slow, occasional)
content/library/<id>.md  → hand-written            (reviews + metadata overrides)
images/library/overrides/<id>.jpg → hand-placed cover replacements
                    ↓
tools/library-build.mjs  → data/library.json       (offline, fast, safe)
```

This split exists because `library-sync.mjs` rebuilds its output wholesale.
It used to write `library.json` directly, which destroyed any hand-written
review on the next run. **Sync must never write `data/library.json` again.**

Review file format:

```markdown
---
starred: true
finished: 2026-03
title: Paris, Texas
creator: Wim Wenders
year: 1984
---

Review body in markdown. Paragraphs, **bold**, *italic*, [links](https://x).
```

All frontmatter keys optional. `title`/`creator`/`year` override synced values.
Run `node tools/library-build.mjs` after any edit.

## Design decisions worth not re-litigating

- **Renderer.** Three were prototyped in `library-lab.html`; per-type CSS
  physics won. `library-lab.html` is kept as a record. Do not carry its
  chrome (renderer tabs, physics dropdown, spine-label checkbox) into the
  real page.
- **Spines are generated, not cropped.** No public API serves book spine
  artwork. The old approach rendered the front cover at `height:100%` inside
  a ~30px `overflow:hidden` box, showing the leftmost ~18% of the jacket,
  which reads as a smear. Spines are now built from metadata + the extracted
  palette: vertical title and author, accent rules top and bottom.
- **Film rack has no lean.** The old `((id.length * 7) % 5) - 2` tilt read as
  noise. Posters sit bottom-aligned and upright.
- **Hero does not hijack the wheel.** The reference `preventDefault`s a
  3000px virtual scroll. Progress is real page scroll across exactly one
  viewport (`clamp(scrollY / innerHeight, 0, 1)`), inside a 100vh sticky in a
  200vh track. Do not reintroduce wheel capture; it traps visitors before
  they reach any shelf and fights the horizontally-scrolling shelves.
- **Headline is two centered lines** ("You are what you" / rotating verb).
  Verbs: `read, listen to, watch, play, whatever`. It is centered rather than
  left-justified *because* the verb sits on its own line — with nothing beside
  it, a width change cannot shove the stem. If you ever put them back on one
  line, the stem must be pinned again.
- **Two subtle bugs already fixed. Do not regress them:**
  - The outgoing verb must go `position: absolute` at swap time, or its
    characters keep their width and the verb visibly drifts.
  - `apexY` in `geom()` is measured from the **stage centre**, not the
    viewport top, because cards are positioned at `top:50%/left:50%`.
    Treating it as from-the-top (as the reference does) double-counts half a
    viewport and drops the arc below the fold.

## Verified working

- 29/29 unit tests
- No console errors, all `images/library/*` requests 200/304
- Shelves: 8 spines, 8 sleeves, 8 posters, 4 tiles
- Detail: opens in place, correct metadata, markdown renders (2 paragraphs,
  strong, em, link with `rel=noopener`), Escape closes, second click closes,
  only one open at a time across shelves
- Headline: all 5 verbs cycle, every one centered with 0px offset, blur-in
  reveal fires after the ring forms, screen-reader text stays in sync
- Mobile 375x812: no horizontal page overflow

## WHERE I STOPPED — pick up here

I had just committed the arc-fitting fix and was **mid-verification of the
hero arc on mobile**. Last measurement at 375px wide, `scrollY: 812`:

```
left: 16, right: 359, vw: 375   → fits horizontally
```

That reading was taken while the springs were still settling, so **it is not
conclusive**. Redo it.

### Next steps, in order

1. **Finish mobile arc verification.** At 375x812, scroll to `innerHeight`,
   let the springs settle (they run ~1-2s at stiffness 40 / damping 15), then
   confirm all 28 cards are within the viewport on both axes:
   ```js
   const r = [...document.querySelectorAll('.hcard')].map(c => c.getBoundingClientRect());
   ({ left: Math.min(...r.map(x => x.left)), right: Math.max(...r.map(x => x.right)),
      top: Math.min(...r.map(x => x.top)), bottom: Math.max(...r.map(x => x.bottom)) })
   ```
   Also take a screenshot. 28 cards fanned across 375px is dense; if it reads
   as mush rather than a fanned deck, consider showing a subset on mobile.
   That is a judgment call for Quinn, not an obvious fix.

2. **Verify `prefers-reduced-motion`.** Never actually tested. Emulate it,
   reload, confirm: hero renders directly at the resting arc with no
   scatter/line/circle intro, the verb does not rotate, the headline is
   visible immediately (no blur), and detail expansion is instant.

3. **Confirm the desktop scroll handoff.** The sticky hero releases at
   `scrollY = 993` on a 993px viewport. Verify the arc is fully formed at the
   release point and the shelves arrive without a visible jump. Note the
   browser pane kept resizing during my session, which made scroll
   measurements drift; pin the viewport size first.

### Known open items (not bugs in the code)

- **Two cover images are still wrong** and need art Quinn supplies:
  - `film-moonlight.jpg` is a photograph of the moon (the Wikipedia resolver
    hit the astronomical article, not the 2016 film)
  - `film-chungking-express.jpg` is a text playbill, not the poster

  The *text* for both is already corrected via frontmatter. Fix the images by
  dropping files at `images/library/overrides/<id>.jpg` and rebuilding. The
  pipeline support is done and tested.

- **No reviews are written yet.** All 28 items show "No writeup yet." The
  pipeline is verified end-to-end but `content/library/` currently holds only
  the five metadata-correction files. Do not write reviews on Quinn's behalf.

- **Undecided:** whether `library-lab.html` stays in the repo. I left it.
  Quinn was asked and has not answered.

- **Out of scope by decision:** no sort, no filter, no search, no ratings, no
  tags. Do not add them without asking.
