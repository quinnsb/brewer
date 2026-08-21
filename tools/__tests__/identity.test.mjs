import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { slug, itemId, shelfGeometry, SHAPE } from "../lib/identity.mjs";

const raw = JSON.parse(await readFile(path.resolve(import.meta.dirname, "../../data/library.raw.json"), "utf8"));

test("slug strips punctuation and curly apostrophes alike", () => {
  assert.equal(slug("Gravity's Rainbow"), "gravitys-rainbow");
  assert.equal(slug("Gravity’s Rainbow"), "gravitys-rainbow");
  assert.equal(slug("Paris, Texas (film)"), "paris-texas-film");
  assert.equal(slug("  spaced  out  "), "spaced-out");
  assert.equal(slug("99% Invisible"), "99-invisible");
});

test("slug caps length so an id cannot run away", () => {
  assert.ok(slug("a".repeat(200)).length <= 60);
});

/* The guard that matters: these helpers were lifted out of library-sync.mjs, so
   they must still reproduce every id and every shelf number already committed.
   If this fails, extracting them changed the shelf. */
test("every existing item's id is reproduced from its title", () => {
  for (const item of raw.items) {
    assert.equal(itemId(item.type, item.title), item.id, `id drift for ${item.title}`);
  }
});

test("every existing item's shelf geometry is reproduced from its id", () => {
  for (const item of raw.items) {
    const { height, thickness } = shelfGeometry(item.id);
    assert.equal(height, item.height, `height drift for ${item.id}`);
    assert.equal(thickness, item.thickness, `thickness drift for ${item.id}`);
  }
});

test("every existing item's shape and aspect match its type", () => {
  for (const item of raw.items) {
    assert.equal(item.shape, SHAPE[item.type].shape);
    assert.equal(item.aspect, SHAPE[item.type].aspect);
  }
});

test("geometry is stable across calls", () => {
  assert.deepEqual(shelfGeometry("book-x"), shelfGeometry("book-x"));
  assert.notDeepEqual(shelfGeometry("book-x"), shelfGeometry("book-y"));
});
