import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { itemWithNote, buildNote } from "../../api/lib/apply-note.mjs";
import { mergeItem } from "../lib/merge.mjs";
import { applyTaxonomy } from "../lib/taxonomy.mjs";
import { applyListening } from "../lib/listening.mjs";
import { applyWatching } from "../lib/watching.mjs";
import { applyPalette } from "../lib/palette.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const load = async (f) => JSON.parse(await readFile(path.join(ROOT, f), "utf8"));

const raw = await load("data/library.raw.json");
const taxonomy = await load("data/library-taxonomy.json");
const listening = await load("data/library-listening.json");
const watching = await load("data/library-watching.json");
const palette = await load("data/library-palette.json");
const published = await load("data/library.json");

/* The whole design rests on this: the admin recomputes one item, the real build
   recomputes all of them, and the two must agree exactly. If this ever fails,
   an admin save has started producing a file the build would undo. */
const OVERRIDE_DIR = path.join(ROOT, "images", "library", "overrides");
/* Whether a hand-placed cover exists is part of what the build computes, so the
   simulation has to ask the same question. Hardcoding "no override" here made
   this pass right up until the first override was installed. */
const hasOverride = (id) => existsSync(path.join(OVERRIDE_DIR, `${id}.jpg`));

function fullBuild(notes = {}) {
  const catalog = applyTaxonomy(applyWatching(applyListening(raw.items, listening), watching), taxonomy);
  return applyPalette(
    catalog.map((item) => mergeItem(item, notes[item.id] ?? null, hasOverride(item.id), () => {})),
    palette
  );
}

const ID = "book-the-left-hand-of-darkness";

test("saving a note matches what the full build would produce", () => {
  const noteText = buildNote({ rating: 4.5, starred: true, finished: "2026-03", creator: "Ursula K. Le Guin", body: "A real writeup." });
  const viaAdmin = itemWithNote({ items: published.items, rawItems: raw.items, taxonomy, listening, watching, palette, id: ID, noteText });
  const viaBuild = fullBuild({ [ID]: noteText }).find((i) => i.id === ID);
  assert.deepEqual(viaAdmin.item, viaBuild);
});

test("clearing a note matches the full build too", () => {
  const viaAdmin = itemWithNote({ items: published.items, rawItems: raw.items, taxonomy, listening, watching, palette, id: ID, noteText: null });
  const viaBuild = fullBuild().find((i) => i.id === ID);
  assert.deepEqual(viaAdmin.item, viaBuild);
});

test("every other item is left byte-identical", () => {
  const noteText = buildNote({ rating: 3, body: "Changed." });
  const { items } = itemWithNote({ items: published.items, rawItems: raw.items, taxonomy, listening, watching, palette, id: ID, noteText });
  assert.equal(items.length, published.items.length);
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === ID) continue;
    assert.equal(items[i], published.items[i], `item ${items[i].id} should be the same object, untouched`);
  }
});

test("item order is preserved", () => {
  const { items } = itemWithNote({ items: published.items, rawItems: raw.items, taxonomy, listening, watching, palette, id: ID, noteText: null });
  assert.deepEqual(items.map((i) => i.id), published.items.map((i) => i.id));
});

test("an unknown id is refused rather than silently appended", () => {
  assert.throws(
    () => itemWithNote({ items: published.items, rawItems: raw.items, taxonomy, listening, palette, id: "book-not-real", noteText: null }),
    /unknown item/i
  );
});

test("a bad rating surfaces as a warning instead of vanishing", () => {
  const { warnings, item } = itemWithNote({
    items: published.items, rawItems: raw.items, taxonomy, listening, palette,
    id: ID, noteText: buildNote({ rating: 7.5 }),
  });
  assert.equal(item.rating, null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /rating/i);
});

/* ---- buildNote ---- */

test("buildNote writes only the keys that carry something", () => {
  const note = buildNote({ rating: 4, body: "Words." });
  assert.match(note, /rating: 4/);
  assert.doesNotMatch(note, /starred/);
  assert.doesNotMatch(note, /finished/);
  assert.match(note, /\nWords\.\n/);
});

test("buildNote returns null when there is nothing to record", () => {
  assert.equal(buildNote({ body: "   " }), null);
  assert.equal(buildNote({}), null);
});

test("buildNote omits starred when it is false rather than writing false", () => {
  assert.doesNotMatch(buildNote({ rating: 2, starred: false }), /starred/);
});

test("a note buildNote produces round-trips through the merge", () => {
  const note = buildNote({ rating: 0.5, starred: true, finished: "2025-12", body: "Short." });
  const { item } = itemWithNote({ items: published.items, rawItems: raw.items, taxonomy, listening, watching, palette, id: ID, noteText: note });
  assert.equal(item.rating, 0.5);
  assert.equal(item.starred, true);
  assert.equal(item.finished, "2025-12");
  assert.equal(item.reviewHtml, "<p>Short.</p>");
});
