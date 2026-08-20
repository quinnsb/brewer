# Library Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `library.html` presenting Quinn's media library as per-type physical shelves, with generated book spines, expand-in-place reviews, and a scroll-driven hero.

**Architecture:** Three sequential phases. Phase 1 is a build-time content pipeline that splits network sync from local merge, so hand-written reviews can never be clobbered. Phase 2 is the page and its shelves. Phase 3 is the hero animation. Pure logic lives in native ES modules under `js/lib/`, imported unchanged by both the browser and `node:test`. No bundler, no framework, no dependencies.

**Tech Stack:** Static HTML, CSS, native ES modules (`<script type="module">`). Node 25 for `tools/*.mjs`. `node --test` for unit tests. `python3 -m http.server 4180` for local dev.

## Global Constraints

- **No dependencies.** No `package.json`, no bundler, no framework. Anything imported must be built into Node or the browser.
- **Generated and hand-authored artifacts never share a path.** `data/library.raw.json` and `data/library.json` are generated; `content/library/*.md` and `images/library/overrides/*` are authored.
- **`data/library.json` is never hand-edited.**
- **Palette:** `--lib-bg: #0b0b0c`, `--lib-fg: #d8d6d1`, `--lib-dim: rgba(216,214,209,.52)`, `--lib-line: rgba(216,214,209,.18)`, `--lib-accent: #e8531c`.
- **Type:** Aeonik for headers, Space Mono for labels/metadata, Degular for body and spine typography.
- **Copy rule:** no em dashes in any user-facing copy on the page (per project memory).
- **`library.html` must not import `css/styles.css`** or depend on the site's header, footer, or menu dock.
- **Every animation must have a `prefers-reduced-motion: reduce` resting state.**
- **Shared easing:** `cubic-bezier(.16,1,.3,1)` for expansion and content arrival.

## Testing strategy

Two tiers, honestly separated:

- **Unit tests (`node --test`)** cover pure logic: frontmatter parsing, markdown rendering, merge/override resolution, spine dimensions, circle and arc geometry, spring integration. These are the parts where a silent wrong answer is invisible.
- **Browser verification** covers DOM rendering, layout, and motion via the preview tools (`read_page`, `read_console_messages`, screenshots). Asserting on rendered pixels in a unit test would be theater.

Run all unit tests: `node --test tools/__tests__/`

---

### Task 1: Frontmatter parser

**Files:**
- Create: `tools/lib/frontmatter.mjs`
- Test: `tools/__tests__/frontmatter.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `parseFrontmatter(text: string) -> { data: Record<string, string|number|boolean>, body: string }`

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/frontmatter.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "../lib/frontmatter.mjs";

test("parses keys and body", () => {
  const { data, body } = parseFrontmatter(
    "---\nstarred: true\nyear: 1984\ntitle: Paris, Texas\n---\n\nWenders shoots.\n"
  );
  assert.equal(data.starred, true);
  assert.equal(data.year, 1984);
  assert.equal(data.title, "Paris, Texas");
  assert.equal(body, "Wenders shoots.");
});

test("handles a file with no frontmatter", () => {
  const { data, body } = parseFrontmatter("Just a review.\n");
  assert.deepEqual(data, {});
  assert.equal(body, "Just a review.");
});

test("handles frontmatter with no body", () => {
  const { data, body } = parseFrontmatter("---\nstarred: true\n---\n");
  assert.equal(data.starred, true);
  assert.equal(body, "");
});

test("keeps colons inside values", () => {
  const { data } = parseFrontmatter("---\ntitle: Blade Runner: The Final Cut\n---\n");
  assert.equal(data.title, "Blade Runner: The Final Cut");
});

test("treats false and 0 as their literal types", () => {
  const { data } = parseFrontmatter("---\nstarred: false\nyear: 0\n---\n");
  assert.equal(data.starred, false);
  assert.equal(data.year, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/__tests__/frontmatter.test.mjs`
Expected: FAIL, cannot find module `../lib/frontmatter.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// tools/lib/frontmatter.mjs
/* Minimal YAML-subset frontmatter. Flat `key: value` pairs only, which is
   all the review files need. No nesting, no lists, no anchors. */

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function coerce(raw) {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v !== "" && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

export function parseFrontmatter(text) {
  const match = FENCE.exec(text);
  if (!match) return { data: {}, body: text.trim() };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    /* split on the FIRST colon only, so values may contain colons */
    data[line.slice(0, idx).trim()] = coerce(line.slice(idx + 1));
  }
  return { data, body: text.slice(match[0].length).trim() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/__tests__/frontmatter.test.mjs`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add tools/lib/frontmatter.mjs tools/__tests__/frontmatter.test.mjs
git commit -m "Add frontmatter parser for library review files"
```

---

### Task 2: Minimal markdown renderer

**Files:**
- Create: `tools/lib/markdown.mjs`
- Test: `tools/__tests__/markdown.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `renderMarkdown(md: string) -> string` (HTML)

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/markdown.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../lib/markdown.mjs";

test("wraps paragraphs split by blank lines", () => {
  assert.equal(renderMarkdown("One.\n\nTwo."), "<p>One.</p><p>Two.</p>");
});

test("joins soft-wrapped lines into one paragraph", () => {
  assert.equal(renderMarkdown("One\ntwo."), "<p>One two.</p>");
});

test("renders emphasis", () => {
  assert.equal(renderMarkdown("**bold** and *it*"), "<p><strong>bold</strong> and <em>it</em></p>");
});

test("renders links", () => {
  assert.equal(
    renderMarkdown("see [it](https://x.com)"),
    '<p>see <a href="https://x.com" rel="noopener">it</a></p>'
  );
});

test("escapes HTML so review text cannot inject markup", () => {
  assert.equal(
    renderMarkdown('<img src=x onerror="alert(1)">'),
    "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>"
  );
});

test("escapes quotes inside link hrefs", () => {
  assert.equal(
    renderMarkdown('[a](https://x.com/"onmouseover=)'),
    '<p><a href="https://x.com/&quot;onmouseover=" rel="noopener">a</a></p>'
  );
});

test("returns empty string for empty input", () => {
  assert.equal(renderMarkdown(""), "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/__tests__/markdown.test.mjs`
Expected: FAIL, cannot find module `../lib/markdown.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// tools/lib/markdown.mjs
/* Deliberately tiny. Paragraphs, emphasis, links. Anything more and the
   answer is a real parser, not more regexes.

   Escaping happens FIRST, on the raw text, so review copy can never inject
   markup. The inline rules below then re-introduce only the tags we chose. */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escape = (s) => s.replace(/[&<>"]/g, (c) => ESCAPES[c]);

function inline(text) {
  return text
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function renderMarkdown(md) {
  const trimmed = md.trim();
  if (!trimmed) return "";
  return escape(trimmed)
    .split(/\r?\n\s*\r?\n/)
    .map((block) => `<p>${inline(block.replace(/\r?\n/g, " ").trim())}</p>`)
    .join("");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/__tests__/markdown.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add tools/lib/markdown.mjs tools/__tests__/markdown.test.mjs
git commit -m "Add minimal markdown renderer for library reviews"
```

---

### Task 3: Merge logic

**Files:**
- Create: `tools/lib/merge.mjs`
- Test: `tools/__tests__/merge.test.mjs`

**Interfaces:**
- Consumes: `parseFrontmatter` (Task 1), `renderMarkdown` (Task 2)
- Produces: `mergeItem(raw: object, noteText: string|null, hasOverrideCover: boolean) -> object`

The merged item keeps every field from `raw` and adds/overrides: `title`, `creator`, `year` (from frontmatter when present), `starred: boolean`, `finished: string|null`, `reviewHtml: string|null`, `cover: string`.

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/merge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeItem } from "../lib/merge.mjs";

const RAW = {
  id: "film-paris-texas-film",
  type: "film",
  title: "Paris, Texas (film)",
  creator: "Wim Wenders",
  year: 1984,
  cover: "images/library/film-paris-texas-film.jpg",
  starred: false,
  note: null,
};

test("passes raw through untouched when there is no note", () => {
  const out = mergeItem(RAW, null, false);
  assert.equal(out.title, "Paris, Texas (film)");
  assert.equal(out.reviewHtml, null);
  assert.equal(out.starred, false);
  assert.equal(out.cover, "images/library/film-paris-texas-film.jpg");
});

test("frontmatter overrides synced metadata", () => {
  const out = mergeItem(RAW, "---\ntitle: Paris, Texas\nstarred: true\n---\n\nGood.", false);
  assert.equal(out.title, "Paris, Texas");
  assert.equal(out.starred, true);
  assert.equal(out.reviewHtml, "<p>Good.</p>");
});

test("absent frontmatter keys do not clobber synced values", () => {
  const out = mergeItem(RAW, "---\nstarred: true\n---\n\nGood.", false);
  assert.equal(out.title, "Paris, Texas (film)");
  assert.equal(out.creator, "Wim Wenders");
  assert.equal(out.year, 1984);
});

test("a note with no body yields a null review, not an empty paragraph", () => {
  const out = mergeItem(RAW, "---\nstarred: true\n---\n", false);
  assert.equal(out.reviewHtml, null);
});

test("override cover wins over the synced cover", () => {
  const out = mergeItem(RAW, null, true);
  assert.equal(out.cover, "images/library/overrides/film-paris-texas-film.jpg");
});

test("starred defaults to false when frontmatter omits it", () => {
  const out = mergeItem(RAW, "Just prose.", false);
  assert.equal(out.starred, false);
  assert.equal(out.reviewHtml, "<p>Just prose.</p>");
});

test("finished is null when absent", () => {
  assert.equal(mergeItem(RAW, null, false).finished, null);
  assert.equal(mergeItem(RAW, "---\nfinished: 2026-03\n---\n", false).finished, "2026-03");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/__tests__/merge.test.mjs`
Expected: FAIL, cannot find module `../lib/merge.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// tools/lib/merge.mjs
import { parseFrontmatter } from "./frontmatter.mjs";
import { renderMarkdown } from "./markdown.mjs";

/* One raw (synced) item plus its optional hand-written note becomes one
   published item. Sync owns facts it can fetch; the note owns everything a
   human decided, and always wins. */
export function mergeItem(raw, noteText, hasOverrideCover) {
  const { data, body } = noteText ? parseFrontmatter(noteText) : { data: {}, body: "" };
  const html = renderMarkdown(body);

  const merged = {
    ...raw,
    title: data.title ?? raw.title,
    creator: data.creator ?? raw.creator,
    year: data.year ?? raw.year,
    starred: data.starred === true,
    finished: data.finished ?? null,
    reviewHtml: html || null,
  };
  if (hasOverrideCover) merged.cover = `images/library/overrides/${raw.id}.jpg`;
  /* `note` was the old inline-review field; reviewHtml replaces it. */
  delete merged.note;
  return merged;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/__tests__/merge.test.mjs`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add tools/lib/merge.mjs tools/__tests__/merge.test.mjs
git commit -m "Add merge logic joining synced items with authored reviews"
```

---

### Task 4: Wire the pipeline and correct the catalogue

**Files:**
- Create: `tools/library-build.mjs`
- Modify: `tools/library-sync.mjs` (change `OUT` to `library.raw.json`; header comment)
- Create: `content/library/film-moonlight.md`, `content/library/film-paris-texas-film.md`, `content/library/film-burning-2018-film.md`, `content/library/film-the-master-2012-film.md`, `content/library/book-the-left-hand-of-darkness.md`
- Create: `data/library.raw.json` (renamed from current `library.json`)

**Interfaces:**
- Consumes: `mergeItem` (Task 3)
- Produces: `data/library.json` with shape `{ generatedAt, items: [...] }`, each item carrying `reviewHtml`, `starred`, `finished`, and a resolved `cover`.

- [ ] **Step 1: Point sync at the raw file**

In `tools/library-sync.mjs`, change the output constant:

```js
const OUT = path.join(ROOT, "data", "library.raw.json");
```

And update the header comment block:

```js
   Run:  node tools/library-sync.mjs
   Out:  data/library.raw.json      raw synced catalog (NEVER hand-edit)
         images/library/<id>.jpg    cached cover art

   This script only ever writes library.raw.json. It must never write
   data/library.json, which is the merge of this file with the hand-written
   reviews in content/library/. Sync overwrites its output wholesale, so
   anything authored would be destroyed on the next run.
```

- [ ] **Step 2: Preserve the existing synced data under its new name**

```bash
git mv data/library.json data/library.raw.json
```

- [ ] **Step 3: Write the build script**

```js
// tools/library-build.mjs
/* ============================================================
   LIBRARY BUILD — merge synced catalog with hand-written reviews

   Run:  node tools/library-build.mjs
   In:   data/library.raw.json      from library-sync.mjs (network)
         content/library/<id>.md    hand-written reviews + overrides
         images/library/overrides/  hand-placed cover replacements
   Out:  data/library.json          what the page reads

   Offline and fast, so it is safe to run on every edit. Sync is the slow
   networked half and never writes this file.
   ============================================================ */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { mergeItem } from "./lib/merge.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW = path.join(ROOT, "data", "library.raw.json");
const OUT = path.join(ROOT, "data", "library.json");
const NOTES_DIR = path.join(ROOT, "content", "library");
const OVERRIDE_DIR = path.join(ROOT, "images", "library", "overrides");

async function readNote(id) {
  const file = path.join(NOTES_DIR, `${id}.md`);
  if (!existsSync(file)) return null;
  return readFile(file, "utf8");
}

async function main() {
  const raw = JSON.parse(await readFile(RAW, "utf8"));
  const ids = new Set(raw.items.map((i) => i.id));

  const items = [];
  for (const item of raw.items) {
    items.push(
      mergeItem(item, await readNote(item.id), existsSync(path.join(OVERRIDE_DIR, `${item.id}.jpg`)))
    );
  }

  /* A note whose filename matches no item is a silent no-op otherwise, and
     that is exactly how a typo'd id hides a missing review for months. */
  if (existsSync(NOTES_DIR)) {
    for (const f of await readdir(NOTES_DIR)) {
      if (!f.endsWith(".md")) continue;
      const id = f.slice(0, -3);
      if (!ids.has(id)) console.warn(`  WARN  ${f} matches no item id`);
    }
  }

  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2));

  const reviewed = items.filter((i) => i.reviewHtml).length;
  console.log(`${items.length} items -> data/library.json (${reviewed} with reviews)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Write the metadata correction files**

`content/library/film-paris-texas-film.md`:

```markdown
---
title: Paris, Texas
---
```

`content/library/film-burning-2018-film.md`:

```markdown
---
title: Burning
---
```

`content/library/film-the-master-2012-film.md`:

```markdown
---
title: The Master
---
```

`content/library/book-the-left-hand-of-darkness.md`:

```markdown
---
creator: Ursula K. Le Guin
---
```

`content/library/film-moonlight.md`:

```markdown
---
title: Moonlight
creator: Barry Jenkins
year: 2016
---
```

- [ ] **Step 5: Run the build and verify the corrections landed**

Run: `node tools/library-build.mjs`
Expected: `28 items -> data/library.json (0 with reviews)`

Then verify:

```bash
node -e "
const items = require('./data/library.json').items;
const get = id => items.find(i => i.id === id);
console.log(get('film-paris-texas-film').title);
console.log(get('film-moonlight').creator, get('film-moonlight').year);
console.log(get('book-the-left-hand-of-darkness').creator);
console.log('no (film) suffixes left:', !items.some(i => /\(\d*\s*film\)/.test(i.title)));
"
```

Expected:
```
Paris, Texas
Barry Jenkins 2016
Ursula K. Le Guin
no (film) suffixes left: true
```

- [ ] **Step 6: Commit**

```bash
git add tools/library-build.mjs tools/library-sync.mjs data/ content/library/
git commit -m "Split library sync from build so reviews survive a resync"
```

**Note on remaining bad art:** `film-moonlight.jpg` (a photo of the moon) and `film-chungking-express.jpg` (a playbill) are still wrong images. They are fixed by dropping correct files at `images/library/overrides/<id>.jpg`, which the build already prefers. That needs source images Quinn supplies; the pipeline support is done.

---

### Task 5: Geometry module

**Files:**
- Create: `js/lib/geometry.js`
- Test: `tools/__tests__/geometry.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `lerp(a: number, b: number, t: number) -> number`
  - `spineWidth(item) -> number`
  - `spineHeight(item) -> number`
  - `circlePosition(i, total, radius) -> { x, y, rotation }`
  - `arcPosition(i, total, opts) -> { x, y, rotation }` where `opts` is `{ radius, centerY, spread, offset }`
  - `springStep(current, target, velocity, dt, stiffness, damping) -> { value, velocity }`

This is a browser ES module. `node --test` imports it directly — the same file, unmodified, runs in both.

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/geometry.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lerp, spineWidth, spineHeight, circlePosition, arcPosition, springStep,
} from "../../js/lib/geometry.js";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~= ${b}`);

test("lerp hits both ends and the midpoint", () => {
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
  assert.equal(lerp(0, 10, 0.5), 5);
});

test("spine dimensions follow the documented formula", () => {
  assert.equal(spineWidth({ thickness: 1 }), 40);      // 21 + 1*19
  assert.equal(spineHeight({ height: 1 }), 286);       // 212 + 1*74
  assert.equal(spineWidth({ thickness: 0.913 }), 38);  // rounded
});

test("spine dimensions are deterministic for the same input", () => {
  assert.equal(spineWidth({ thickness: 1.401 }), spineWidth({ thickness: 1.401 }));
});

test("circle positions are evenly spaced on the given radius", () => {
  const p = circlePosition(0, 4, 100);
  close(p.x, 100);
  close(p.y, 0);
  const q = circlePosition(1, 4, 100);
  close(q.x, 0);
  close(q.y, 100);
});

test("every circle position sits exactly on the radius", () => {
  for (let i = 0; i < 8; i++) {
    const { x, y } = circlePosition(i, 8, 50);
    close(Math.hypot(x, y), 50, 1e-9);
  }
});

test("arc is symmetric about its apex with no offset", () => {
  const opts = { radius: 500, centerY: 600, spread: 130, offset: 0 };
  const first = arcPosition(0, 5, opts);
  const last = arcPosition(4, 5, opts);
  close(first.x, -last.x, 1e-9);
  close(first.y, last.y, 1e-9);
});

test("arc apex is the highest point", () => {
  const opts = { radius: 500, centerY: 600, spread: 130, offset: 0 };
  const mid = arcPosition(2, 5, opts);
  const edge = arcPosition(0, 5, opts);
  assert.ok(mid.y < edge.y, "apex should have a smaller y than the edges");
});

test("arc offset rotates the whole arc", () => {
  const base = { radius: 500, centerY: 600, spread: 130, offset: 0 };
  const shifted = { ...base, offset: -20 };
  assert.ok(arcPosition(2, 5, shifted).x < arcPosition(2, 5, base).x);
});

test("spring converges to its target and settles", () => {
  let value = 0, velocity = 0;
  for (let i = 0; i < 600; i++) {
    ({ value, velocity } = springStep(value, 100, velocity, 1 / 60, 40, 15));
  }
  close(value, 100, 0.01);
  close(velocity, 0, 0.01);
});

test("spring does not explode at a large timestep", () => {
  let value = 0, velocity = 0;
  for (let i = 0; i < 100; i++) {
    ({ value, velocity } = springStep(value, 100, velocity, 0.5, 40, 15));
  }
  assert.ok(Number.isFinite(value), "value diverged");
  assert.ok(Math.abs(value) < 1000, `value blew up: ${value}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/__tests__/geometry.test.mjs`
Expected: FAIL, cannot find module `../../js/lib/geometry.js`

- [ ] **Step 3: Write minimal implementation**

```js
// js/lib/geometry.js
/* Pure geometry and motion math for the library page.

   No DOM references anywhere in this file. That is what lets `node --test`
   import it unmodified, and it is worth preserving: this is the half of the
   animation where a wrong answer is invisible in a screenshot. */

export const lerp = (a, b, t) => a * (1 - t) + b * t;

/* Deterministic per-item, driven by values baked into the catalogue, so a
   title occupies the same slot on every reload. */
export const spineWidth = (item) => Math.round(21 + item.thickness * 19);
export const spineHeight = (item) => Math.round(212 + item.height * 74);

const RAD = Math.PI / 180;

export function circlePosition(i, total, radius) {
  const deg = (i / total) * 360;
  const rad = deg * RAD;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius, rotation: deg + 90 };
}

/* A "rainbow" arc: convex up, apex centred. Cards sit on a circle whose
   centre is far below the viewport, so the visible top slice reads as a
   gentle curve rather than a ring. */
export function arcPosition(i, total, { radius, centerY, spread, offset }) {
  const step = total > 1 ? spread / (total - 1) : 0;
  const deg = -90 - spread / 2 + i * step + offset;
  const rad = deg * RAD;
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius + centerY,
    rotation: deg + 90,
  };
}

/* Semi-implicit Euler. Velocity is integrated before position, which is what
   keeps it stable when a background tab hands back a huge dt. dt is clamped
   for the same reason. */
export function springStep(current, target, velocity, dt, stiffness, damping) {
  const h = Math.min(dt, 1 / 30);
  const v = velocity + (-stiffness * (current - target) - damping * velocity) * h;
  return { value: current + v * h, velocity: v };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/__tests__/geometry.test.mjs`
Expected: PASS, 10 tests

- [ ] **Step 5: Run the whole suite**

Run: `node --test tools/__tests__/`
Expected: PASS, 29 tests total

- [ ] **Step 6: Commit**

```bash
git add js/lib/geometry.js tools/__tests__/geometry.test.mjs
git commit -m "Add pure geometry module shared by page and tests"
```

---

### Task 6: Page shell and Archive styling

**Files:**
- Create: `library.html`
- Create: `css/library.css`

**Interfaces:**
- Consumes: nothing
- Produces: `library.html` with `<div id="hero">` and `<main id="shelves">` mount points; CSS custom properties from Global Constraints on `:root`.

- [ ] **Step 1: Write the page shell**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Library</title>
  <meta name="description" content="Books, records, films, and podcasts worth keeping." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/library.css" />
</head>
<body class="library">
  <section id="hero" class="hero" aria-labelledby="hero-heading">
    <div class="hero-track">
      <div class="hero-sticky">
        <div class="hero-inner">
          <h1 id="hero-heading" class="hero-line">
            <span class="stem">You are what you</span><span class="slot" id="verb-slot"></span>
          </h1>
        </div>
        <div class="hero-stage" id="hero-stage" aria-hidden="true"></div>
      </div>
    </div>
  </section>

  <main id="shelves" class="shelves"></main>

  <footer class="lib-foot">
    <p>Twenty-eight things worth keeping. Covers from Open Library, iTunes, and Wikipedia.</p>
  </footer>

  <script type="module" src="js/library.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write the stylesheet**

```css
/* ============================================================
   LIBRARY — standalone page, Archive direction

   Deliberately does NOT import css/styles.css. This page may move to a
   subdomain, so it has to travel by copying files.
   ============================================================ */

@font-face {
  font-family: "Aeonik";
  src: url("../fonts/Aeonik-Regular.otf") format("opentype");
  font-weight: 400; font-display: swap;
}
@font-face {
  font-family: "Aeonik";
  src: url("../fonts/Aeonik-Medium.otf") format("opentype");
  font-weight: 500; font-display: swap;
}
@font-face {
  font-family: "Degular";
  src: url("../fonts/Degular-Regular.otf") format("opentype");
  font-weight: 400; font-display: swap;
}
@font-face {
  font-family: "Degular";
  src: url("../fonts/Degular-Semibold.otf") format("opentype");
  font-weight: 600; font-display: swap;
}

:root {
  --lib-bg: #0b0b0c;
  --lib-fg: #d8d6d1;
  --lib-dim: rgba(216, 214, 209, 0.52);
  --lib-faint: rgba(216, 214, 209, 0.3);
  --lib-line: rgba(216, 214, 209, 0.18);
  --lib-accent: #e8531c;
  --gutter: clamp(20px, 4vw, 56px);
  --shell: 1240px;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --card: 72px;
}

* { box-sizing: border-box; }

body.library {
  margin: 0;
  background: var(--lib-bg);
  color: var(--lib-fg);
  font-family: "Degular", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.shell { max-width: var(--shell); margin: 0 auto; padding-inline: var(--gutter); }

/* ---------- hero ---------- */

.hero-track { height: 200vh; }
.hero-sticky { position: sticky; top: 0; height: 100vh; overflow: hidden; }

.hero-inner {
  max-width: var(--shell); margin: 0 auto; padding: clamp(60px, 12vh, 140px) var(--gutter) 0;
  position: relative; z-index: 2;
}

.hero-line {
  font-family: "Aeonik", system-ui, sans-serif; font-weight: 500;
  font-size: clamp(30px, 5.2vw, 62px); letter-spacing: -0.025em;
  margin: 0; display: flex; align-items: baseline; gap: 0.28em;
  text-align: left; /* the stem never re-centres when the verb resizes */
}
.hero-line .stem { flex: none; }
.hero-line .slot { position: relative; flex: none; color: var(--lib-accent); white-space: nowrap; }

.word { display: inline-flex; }
.word.out { position: absolute; left: 0; top: 0; }
.mask { display: inline-block; overflow: hidden; padding-bottom: 0.14em; }
.mask .ch {
  display: inline-block; white-space: pre;
  transition: transform 0.44s cubic-bezier(0.22, 1, 0.3, 1),
              opacity 0.44s cubic-bezier(0.22, 1, 0.3, 1);
}
.mask .ch.enter { transform: translateY(110%); opacity: 0; }
.mask .ch.leave { transform: translateY(-130%); opacity: 0; }

.hero-stage { position: absolute; inset: 0; z-index: 1; }

.hcard {
  position: absolute; top: 50%; left: 50%;
  width: var(--card); height: var(--card); margin: calc(var(--card) / -2) 0 0 calc(var(--card) / -2);
  perspective: 1000px; cursor: pointer; border: 0; padding: 0; background: none;
  will-change: transform;
}
.hcard-flip {
  position: relative; width: 100%; height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.6s var(--ease);
}
.hcard:hover .hcard-flip, .hcard:focus-visible .hcard-flip { transform: rotateY(180deg); }
.hcard-face {
  position: absolute; inset: 0; backface-visibility: hidden;
  border-radius: 3px; overflow: hidden;
  box-shadow: 0 8px 20px -12px rgba(0, 0, 0, 0.9);
}
.hcard-face img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hcard-back {
  transform: rotateY(180deg);
  background: var(--lib-bg); border: 1px solid var(--lib-line);
  display: flex; flex-direction: column; justify-content: center; gap: 3px;
  padding: 7px; text-align: left;
  font-family: "Space Mono", ui-monospace, monospace;
}
.hcard-back .t { font-size: 8px; line-height: 1.25; color: var(--lib-fg); }
.hcard-back .c { font-size: 7px; line-height: 1.2; color: var(--lib-dim); }

/* ---------- shelves ---------- */

.shelves { max-width: var(--shell); margin: 0 auto; padding: 0 var(--gutter) 140px; position: relative; z-index: 3; background: var(--lib-bg); }
.shelf-block { margin-bottom: 68px; }

.shelf-label {
  font-family: "Space Mono", ui-monospace, monospace;
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em;
  color: var(--lib-dim); border-top: 1px solid var(--lib-line);
  padding-top: 10px; margin-bottom: 18px;
  display: flex; gap: 12px; align-items: baseline;
}
.shelf-label span { text-transform: none; letter-spacing: 0.04em; font-size: 11px; opacity: 0.62; }

.lib-foot {
  border-top: 1px solid var(--lib-line); padding: 26px var(--gutter) 60px;
  max-width: var(--shell); margin: 0 auto;
  font-family: "Space Mono", ui-monospace, monospace; font-size: 11px; color: var(--lib-faint);
  position: relative; z-index: 3; background: var(--lib-bg);
}

@media (prefers-reduced-motion: reduce) {
  .mask .ch, .hcard-flip { transition: none; }
}
```

- [ ] **Step 3: Create a placeholder entry module so the page loads**

```js
// js/library.js
import { spineWidth, spineHeight } from "./lib/geometry.js";

const DATA_URL = "data/library.json";

async function main() {
  const res = await fetch(DATA_URL);
  const { items } = await res.json();
  console.log(`library: ${items.length} items`, spineWidth(items[0]), spineHeight(items[0]));
}

main();
```

- [ ] **Step 4: Verify the page loads clean**

Start the preview (`portfolio` config, port 4180), navigate to `http://localhost:4180/library.html`, then check `read_console_messages` with `onlyErrors: true`.
Expected: no errors; console shows `library: 28 items 38 278`.

- [ ] **Step 5: Commit**

```bash
git add library.html css/library.css js/library.js
git commit -m "Add library page shell in the Archive direction"
```

---

### Task 7: Shelves with generated spines

**Files:**
- Modify: `js/library.js`
- Modify: `css/library.css` (append the shelf physics block)

**Interfaces:**
- Consumes: `spineWidth`, `spineHeight` from `js/lib/geometry.js`
- Produces: `renderShelves(items, root)`, and `buildNode(item)` returning a `<button class="spine|sleeve|poster|tile">`

- [ ] **Step 1: Append shelf physics CSS**

```css
/* ---------- BOOKS: spine shelf ----------
   Spines are GENERATED, not cropped. No public API serves spine artwork, and
   the old approach (front cover at height:100% inside a 30px overflow box)
   showed the leftmost ~18% of the jacket, which reads as a smear. */

.shelf-rail { overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: var(--lib-faint) transparent; }
.shelf-rail::-webkit-scrollbar { height: 6px; }
.shelf-rail::-webkit-scrollbar-thumb { background: var(--lib-faint); border-radius: 3px; }

.spine-shelf { display: flex; align-items: flex-end; gap: 2px; padding-bottom: 3px; }

.spine {
  position: relative; flex: 0 0 var(--spine-w); height: var(--spine-h);
  border: 0; padding: 0; cursor: pointer; overflow: hidden;
  background: var(--cover); color: var(--ink);
  border-radius: 1px 2px 2px 1px;
  transition: flex-basis 0.62s var(--ease);
  box-shadow: inset -7px 0 13px -8px rgba(0, 0, 0, 0.75),
              inset 5px 0 8px -6px rgba(255, 255, 255, 0.22),
              0 7px 16px -10px rgba(0, 0, 0, 0.9);
}
.spine-txt {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 12px;
  writing-mode: vertical-rl; text-orientation: mixed; /* reads top-to-bottom, US convention */
  padding: 16px 0; white-space: nowrap; overflow: hidden;
  transition: opacity 0.3s ease;
}
.spine-txt .t { font-family: "Degular", system-ui; font-weight: 600; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; }
.spine-txt .a { font-size: 9.5px; opacity: 0.68; letter-spacing: 0.05em; text-transform: uppercase; }
.spine-rule { position: absolute; left: 18%; right: 18%; height: 2px; background: var(--accent); }
.spine-rule.top { top: 15px; }
.spine-rule.bot { bottom: 15px; }

/* ---------- ALBUMS: crate ---------- */
.crate { overflow-x: auto; overflow-y: hidden; padding-bottom: 4px; }
.crate-box {
  position: relative; padding: 26px 30px 16px;
  background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(0,0,0,.28));
  border: 1px solid var(--lib-line); border-radius: 3px;
}
.crate-inner { display: flex; align-items: flex-end; gap: 0; padding-left: 8px; }
.sleeve {
  flex: 0 0 108px; width: 168px; height: 168px; border: 0; padding: 0; cursor: pointer;
  background: var(--cover); border-radius: 2px; overflow: hidden;
  transform: rotate(-32deg) skewY(6deg); transform-origin: bottom left;
  transition: flex-basis 0.5s var(--ease), transform 0.5s var(--ease);
  box-shadow: -8px 6px 16px -10px rgba(0,0,0,.9);
}
.sleeve img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sleeve:hover, .sleeve:focus-visible { transform: rotate(-24deg) skewY(4deg) translateY(-8px); }

/* ---------- FILMS: rack ----------
   No lean. The old deterministic tilt from the id read as noise, not handling. */
.rack { display: flex; align-items: flex-end; gap: 9px; padding-bottom: 3px; }
.poster {
  flex: 0 0 auto; border: 0; padding: 0; cursor: pointer; background: var(--cover);
  border-radius: 2px; overflow: hidden; height: 232px;
  transition: transform 0.4s var(--ease);
  box-shadow: 0 8px 18px -10px rgba(0,0,0,.85);
}
.poster img { height: 232px; width: auto; display: block; }
.poster:hover, .poster:focus-visible { transform: translateY(-7px); }

/* ---------- PODCASTS: tiles ---------- */
.tiles { display: flex; gap: 12px; flex-wrap: wrap; }
.tile {
  width: 132px; height: 132px; border: 0; padding: 0; cursor: pointer;
  background: var(--cover); border-radius: 3px; overflow: hidden;
  transition: transform 0.4s var(--ease);
}
.tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tile:hover, .tile:focus-visible { transform: translateY(-5px); }

.spine:focus-visible, .sleeve:focus-visible, .poster:focus-visible, .tile:focus-visible {
  outline: 2px solid var(--lib-accent); outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .spine, .sleeve, .poster, .tile { transition: none; }
}
```

- [ ] **Step 2: Write the shelf renderer**

```js
// js/library.js
import { spineWidth, spineHeight } from "./lib/geometry.js";

const DATA_URL = "data/library.json";

const TYPE_LABEL = {
  book: ["Books", "spine shelf"],
  album: ["Albums", "crate, front facing"],
  film: ["Films", "poster rack"],
  other: ["Podcasts", "tiles"],
};
const ORDER = ["book", "album", "film", "other"];

const el = (tag, cls, attrs) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function paint(node, item) {
  node.style.setProperty("--cover", item.palette?.cover || "#33302b");
  node.style.setProperty("--accent", item.palette?.accent || "#e8531c");
  node.style.setProperty("--ink", item.palette?.ink || "#f1ece3");
}

function coverImg(item) {
  const img = el("img");
  img.src = item.cover;
  img.alt = "";
  img.loading = "lazy";
  return img;
}

const label = (item) =>
  `${item.title}${item.creator ? `, ${item.creator}` : ""}${item.year ? `, ${item.year}` : ""}`;

const BUILDERS = {
  /* Generated spine: palette ground, vertical type, accent rules. */
  book(item) {
    const btn = el("button", "spine", { type: "button", "aria-label": label(item) });
    paint(btn, item);
    btn.style.setProperty("--spine-w", `${spineWidth(item)}px`);
    btn.style.setProperty("--spine-h", `${spineHeight(item)}px`);
    const txt = el("span", "spine-txt");
    txt.append(
      Object.assign(el("span", "t"), { textContent: item.title }),
      Object.assign(el("span", "a"), { textContent: item.creator || "" })
    );
    btn.append(el("span", "spine-rule top"), txt, el("span", "spine-rule bot"));
    return btn;
  },
  album(item) {
    const btn = el("button", "sleeve", { type: "button", "aria-label": label(item) });
    paint(btn, item);
    btn.append(coverImg(item));
    return btn;
  },
  film(item) {
    const btn = el("button", "poster", { type: "button", "aria-label": label(item) });
    paint(btn, item);
    btn.append(coverImg(item));
    return btn;
  },
  other(item) {
    const btn = el("button", "tile", { type: "button", "aria-label": label(item) });
    paint(btn, item);
    btn.append(coverImg(item));
    return btn;
  },
};

const CONTAINER = {
  book() {
    const rail = el("div", "shelf-rail");
    const mount = el("div", "spine-shelf");
    rail.append(mount);
    return { rail, mount };
  },
  album() {
    const rail = el("div", "crate");
    const box = el("div", "crate-box");
    const mount = el("div", "crate-inner");
    box.append(mount);
    rail.append(box);
    return { rail, mount };
  },
  film() {
    const rail = el("div", "shelf-rail");
    const mount = el("div", "rack");
    rail.append(mount);
    return { rail, mount };
  },
  other() {
    const rail = el("div");
    const mount = el("div", "tiles");
    rail.append(mount);
    return { rail, mount };
  },
};

export function renderShelves(items, root) {
  const byType = {};
  for (const it of items) (byType[it.type] ||= []).push(it);

  for (const type of ORDER) {
    const list = byType[type];
    if (!list?.length) continue;

    const block = el("section", "shelf-block");
    const [name, sub] = TYPE_LABEL[type];
    const lab = el("div", "shelf-label");
    lab.append(document.createTextNode(name), Object.assign(el("span"), { textContent: sub }));
    block.append(lab);

    const { rail, mount } = CONTAINER[type]();
    for (const item of list) {
      const node = BUILDERS[type](item);
      node.dataset.id = item.id;
      mount.append(node);
    }
    block.append(rail);
    root.append(block);
  }
}

async function main() {
  const { items } = await (await fetch(DATA_URL)).json();
  renderShelves(items, document.getElementById("shelves"));
}

main();
```

- [ ] **Step 3: Verify in the browser**

Navigate to `http://localhost:4180/library.html`. Check console for errors, then confirm with `read_page` that four `shelf-block` sections exist and that book buttons carry `aria-label` text. Take a screenshot and confirm spines show typography rather than cover crops.
Expected: 8 spines, 8 sleeves, 8 posters, 4 tiles; no console errors.

- [ ] **Step 4: Commit**

```bash
git add js/library.js css/library.css
git commit -m "Render library shelves with generated typographic spines"
```

---

### Task 8: Expand-in-place detail

**Files:**
- Modify: `js/library.js`
- Modify: `css/library.css`

**Interfaces:**
- Consumes: `renderShelves` (Task 7)
- Produces: `wireExpansion(items, root)` attaching click, Escape, and outside-click behavior; exported `openItem(id)` used by the hero in Task 10.

- [ ] **Step 1: Append the expansion CSS**

```css
/* ---------- expand in place ----------
   One easing across the growth and the content arrival so it reads as a
   single gesture rather than two stacked animations. */

.spine.is-open { flex-basis: var(--open-w); }
.spine.is-open .spine-txt { opacity: 0; }
.sleeve.is-open { flex-basis: 188px; transform: rotate(0deg) skewY(0deg) translateY(-10px); }
.poster.is-open { transform: translateY(-7px); }

.detail {
  display: grid; grid-template-columns: minmax(0, 260px) minmax(0, 1fr); gap: 26px;
  margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--lib-line);
  opacity: 0; transform: translateY(10px);
  transition: opacity 0.42s var(--ease), transform 0.42s var(--ease);
}
.detail.is-in { opacity: 1; transform: none; }
.detail[hidden] { display: none; }
.detail img { width: 100%; height: auto; border-radius: 3px; display: block; }
.detail h2 { font-family: "Aeonik", system-ui, sans-serif; font-weight: 500; font-size: 26px; letter-spacing: -0.02em; margin: 0 0 4px; }
.detail .meta { font-family: "Space Mono", ui-monospace, monospace; font-size: 11px; color: var(--lib-dim); margin: 0 0 16px; }
.detail .review { font-size: 15.5px; line-height: 1.62; color: var(--lib-fg); max-width: 62ch; }
.detail .review p { margin: 0 0 0.9em; }
.detail .review a { color: var(--lib-accent); }
.detail .empty { font-family: "Space Mono", ui-monospace, monospace; font-size: 11.5px; color: var(--lib-faint); }
.detail .src { display: inline-block; margin-top: 14px; font-family: "Space Mono", ui-monospace, monospace; font-size: 11px; color: var(--lib-dim); }

@media (max-width: 720px) { .detail { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .detail { transition: none; } }
```

- [ ] **Step 2: Add the detail markup to the page**

In `library.html`, inside `<main id="shelves">`, nothing changes; the detail panel is created per shelf-block by JS.

- [ ] **Step 3: Extend `js/library.js`**

Add to the top-level imports and append these functions, then replace `main()`:

```js
/* ---------- detail ---------- */

let openId = null;

function detailNode(item) {
  const d = el("div", "detail");
  const fig = el("div");
  const img = el("img");
  img.src = item.cover;
  img.alt = "";
  fig.append(img);

  const body = el("div");
  body.append(Object.assign(el("h2"), { textContent: item.title }));
  const bits = [item.creator, item.year, item.finished ? `finished ${item.finished}` : null].filter(Boolean);
  body.append(Object.assign(el("p", "meta"), { textContent: bits.join("  ·  ") }));

  if (item.reviewHtml) {
    const r = el("div", "review");
    r.innerHTML = item.reviewHtml; /* built at build time from own markdown, escaped there */
    body.append(r);
  } else {
    body.append(Object.assign(el("p", "empty"), { textContent: "No writeup yet." }));
  }

  if (item.sourceUrl) {
    const a = el("a", "src", { href: item.sourceUrl, target: "_blank", rel: "noopener" });
    a.textContent = "Source";
    body.append(a);
  }

  d.append(fig, body);
  return d;
}

function closeAll(root) {
  root.querySelectorAll(".is-open").forEach((n) => {
    n.classList.remove("is-open");
    n.setAttribute("aria-expanded", "false");
  });
  root.querySelectorAll(".detail").forEach((d) => d.remove());
  openId = null;
}

export function wireExpansion(items, root) {
  const byId = new Map(items.map((i) => [i.id, i]));

  root.addEventListener("click", (e) => {
    const node = e.target.closest("[data-id]");
    if (!node) return;
    const item = byId.get(node.dataset.id);
    const wasOpen = openId === item.id;
    closeAll(root);
    if (wasOpen) return;

    node.classList.add("is-open");
    node.setAttribute("aria-expanded", "true");
    if (item.type === "book") {
      node.style.setProperty("--open-w", `${Math.round(spineHeight(item) * item.aspect)}px`);
    }
    const d = detailNode(item);
    node.closest(".shelf-block").append(d);
    requestAnimationFrame(() => d.classList.add("is-in"));
    openId = item.id;
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openId) closeAll(root);
  });

  document.addEventListener("click", (e) => {
    if (openId && !e.target.closest(".shelf-block")) closeAll(root);
  });

  /* arrow keys walk a shelf */
  root.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const cur = e.target.closest("[data-id]");
    if (!cur) return;
    const sibs = [...cur.parentElement.querySelectorAll("[data-id]")];
    const next = sibs[sibs.indexOf(cur) + (e.key === "ArrowRight" ? 1 : -1)];
    if (next) { next.focus(); e.preventDefault(); }
  });
}

export function openItem(id) {
  const node = document.querySelector(`#shelves [data-id="${CSS.escape(id)}"]`);
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  node.click();
}

async function main() {
  const { items } = await (await fetch(DATA_URL)).json();
  const root = document.getElementById("shelves");
  renderShelves(items, root);
  wireExpansion(items, root);
  const { initHero } = await import("./library-hero.js");
  initHero(items);
}

main();
```

Also add `aria-expanded="false"` to each button in `BUILDERS` by extending `paint()`'s call sites: set `node.setAttribute("aria-expanded", "false")` inside `paint(node, item)`.

- [ ] **Step 4: Verify in the browser**

Click a spine. Confirm it widens, a `.detail` appears in the same `.shelf-block`, and `read_page` shows the title. Press Escape and confirm it collapses. Click a second item and confirm only one is open.

- [ ] **Step 5: Commit**

```bash
git add js/library.js css/library.css
git commit -m "Expand library items in place with their reviews"
```

---

### Task 9: Hero animation

**Files:**
- Create: `js/library-hero.js`

**Interfaces:**
- Consumes: `lerp`, `circlePosition`, `arcPosition`, `springStep` from `js/lib/geometry.js`; `openItem` from `js/library.js`
- Produces: `initHero(items)` 

- [ ] **Step 1: Write the hero module**

```js
// js/library-hero.js
/* Scroll-driven hero. Ported from a React/Framer reference to vanilla so the
   page keeps zero dependencies.

   The reference preventDefault()s a 3000px virtual scroll. That is not viable
   here: it would trap a visitor in the hero before they reach a single shelf,
   and it would fight the horizontally-scrolling shelves for the same gesture.
   Progress is real page scroll across exactly one viewport instead. */

import { lerp, circlePosition, arcPosition, springStep } from "./lib/geometry.js";
import { openItem } from "./library.js";

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const VERBS = ["read", "listen to", "watch", "play"];

function card(item) {
  const btn = document.createElement("button");
  btn.className = "hcard";
  btn.type = "button";
  btn.setAttribute("aria-label", item.title);
  btn.dataset.id = item.id;
  btn.innerHTML =
    `<span class="hcard-flip">` +
    `<span class="hcard-face"><img src="${item.cover}" alt="" loading="lazy"></span>` +
    `<span class="hcard-face hcard-back">` +
    `<span class="t"></span><span class="c"></span></span></span>`;
  btn.querySelector(".t").textContent = item.title;
  btn.querySelector(".c").textContent = [item.creator, item.year].filter(Boolean).join(", ");
  return btn;
}

/* ---------- rotating verb ---------- */
function rotateVerb(slot) {
  const STAGGER = 24, DUR = 440;
  let vi = 0, current = null;

  const build = (word) => {
    const w = document.createElement("span");
    w.className = "word";
    for (const c of word) {
      const mask = document.createElement("span");
      mask.className = "mask";
      const ch = document.createElement("span");
      ch.className = "ch enter";
      ch.textContent = c;
      mask.append(ch);
      w.append(mask);
    }
    return w;
  };

  const render = (word) => {
    const outgoing = current;
    if (outgoing) {
      /* lift out of flow first, or its characters keep their width and the
         verb visibly drifts right mid-transition */
      outgoing.classList.add("out");
      const chars = outgoing.querySelectorAll(".ch");
      chars.forEach((ch, i) => setTimeout(() => ch.classList.add("leave"), i * STAGGER));
      setTimeout(() => outgoing.remove(), chars.length * STAGGER + DUR + 60);
    }
    const incoming = build(word);
    slot.append(incoming);
    current = incoming;
    const chars = incoming.querySelectorAll(".ch");
    requestAnimationFrame(() =>
      chars.forEach((ch, i) => setTimeout(() => ch.classList.remove("enter"), i * STAGGER))
    );
  };

  render(VERBS[0]);
  if (REDUCED) return;
  setInterval(() => { vi = (vi + 1) % VERBS.length; render(VERBS[vi]); }, 2200);
}

export function initHero(items) {
  const stage = document.getElementById("hero-stage");
  const slot = document.getElementById("verb-slot");
  if (!stage || !slot) return;

  /* screen readers get the sentence, not a stream of characters */
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = VERBS[0];
  slot.parentElement.append(sr);

  rotateVerb(slot);

  const nodes = items.map((item) => {
    const n = card(item);
    n.addEventListener("click", () => openItem(item.id));
    stage.append(n);
    return n;
  });

  const total = nodes.length;
  const scatter = nodes.map(() => ({
    x: (Math.random() - 0.5) * 1500,
    y: (Math.random() - 0.5) * 900,
    rotation: (Math.random() - 0.5) * 180,
    scale: 0.6,
    opacity: 0,
  }));

  let phase = REDUCED ? "circle" : "scatter";
  if (!REDUCED) {
    setTimeout(() => (phase = "line"), 500);
    setTimeout(() => (phase = "circle"), 2500);
  }

  const state = nodes.map((_, i) => ({ ...scatter[i], v: { x: 0, y: 0, r: 0, s: 0 } }));
  let parallax = 0, parallaxV = 0, parallaxTarget = 0;

  addEventListener("mousemove", (e) => {
    if (REDUCED) return;
    parallaxTarget = ((e.clientX / innerWidth) * 2 - 1) * 100;
  });

  const geom = () => {
    const w = innerWidth, h = innerHeight;
    const mobile = w < 768;
    return {
      mobile,
      circleR: Math.min(Math.min(w, h) * 0.35, 350),
      arcR: Math.min(w, h * 1.5) * (mobile ? 1.4 : 1.1),
      apexY: h * (mobile ? 0.35 : 0.25),
      spread: mobile ? 100 : 130,
      scale: mobile ? 1.4 : 1.8,
    };
  };

  const progress = () => {
    if (REDUCED) return 1;
    return Math.min(Math.max(scrollY / innerHeight, 0), 1);
  };

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    const g = geom();
    const p = progress();
    parallaxTarget = REDUCED ? 0 : parallaxTarget;
    ({ value: parallax, velocity: parallaxV } = springStep(parallax, parallaxTarget, parallaxV, dt, 30, 20));

    for (let i = 0; i < total; i++) {
      let target;
      if (phase === "scatter") {
        target = scatter[i];
      } else if (phase === "line") {
        const spacing = 78;
        target = { x: i * spacing - (total * spacing) / 2, y: 0, rotation: 0, scale: 1, opacity: 1 };
      } else {
        const c = circlePosition(i, total, g.circleR);
        const a = arcPosition(i, total, {
          radius: g.arcR,
          centerY: g.apexY + g.arcR,
          spread: g.spread,
          offset: 0,
        });
        target = {
          x: lerp(c.x, a.x + parallax, p),
          y: lerp(c.y, a.y, p),
          rotation: lerp(c.rotation, a.rotation, p),
          scale: lerp(1, g.scale, p),
          opacity: 1,
        };
      }

      const s = state[i];
      if (REDUCED) {
        Object.assign(s, target);
      } else {
        ({ value: s.x, velocity: s.v.x } = springStep(s.x, target.x, s.v.x, dt, 40, 15));
        ({ value: s.y, velocity: s.v.y } = springStep(s.y, target.y, s.v.y, dt, 40, 15));
        ({ value: s.rotation, velocity: s.v.r } = springStep(s.rotation, target.rotation, s.v.r, dt, 40, 15));
        ({ value: s.scale, velocity: s.v.s } = springStep(s.scale, target.scale, s.v.s, dt, 40, 15));
        s.opacity = lerp(s.opacity, target.opacity, 1 - Math.exp(-6 * dt));
      }

      nodes[i].style.transform =
        `translate3d(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px, 0) rotate(${s.rotation.toFixed(2)}deg) scale(${s.scale.toFixed(3)})`;
      nodes[i].style.opacity = s.opacity.toFixed(3);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
```

- [ ] **Step 2: Add the screen-reader utility class**

Append to `css/library.css`:

```css
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
```

- [ ] **Step 3: Verify in the browser**

Load `library.html`. Confirm no console errors, that 28 `.hcard` elements exist, and that they settle into a ring. Scroll one viewport and screenshot to confirm the arc forms and the shelves come up underneath. Confirm scrolling is not blocked at any point.

- [ ] **Step 4: Commit**

```bash
git add js/library-hero.js css/library.css
git commit -m "Add scroll-driven hero with rotating verb"
```

---

### Task 10: Final verification pass

**Files:**
- Modify: whatever the checks below turn up

- [ ] **Step 1: Run the full unit suite**

Run: `node --test tools/__tests__/`
Expected: PASS, 29 tests, 0 failures

- [ ] **Step 2: Check for console errors and failed requests**

Load `library.html`, then `read_console_messages` with `onlyErrors: true` and `read_network_requests` filtered for non-200s.
Expected: no errors; every `images/library/*` request 200.

- [ ] **Step 3: Verify reduced motion**

Emulate `prefers-reduced-motion: reduce`, reload, and confirm the hero renders directly at the arc with no intro and the verb does not rotate.

- [ ] **Step 4: Verify responsive layout**

`resize_window` to mobile (375x812) and reload. Confirm no horizontal body overflow:

```js
document.documentElement.scrollWidth <= window.innerWidth
```
Expected: `true`

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "Fix issues found in library page verification"
```
