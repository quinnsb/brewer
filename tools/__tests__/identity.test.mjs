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
    assert.equal(itemId(item.type, item.title, item.creator), item.id, `id drift for ${item.title}`);
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

/* A title with no Latin characters slugs to the empty string, so every one of
   them became the id "album-". The first Japanese record in the Discogs import
   landed there; a second would have collided with it and overwritten its cover. */
test("a title that slugs to nothing still gets a usable id", () => {
  const id = itemId("album", "となりのトトロ (イメージ・ソング集)", "Joe Hisaishi");
  assert.notEqual(id, "album-");
  assert.match(id, /^album-joe-hisaishi-[a-z0-9]+$/);
});

test("two non-Latin titles by one artist do not collide", () => {
  const a = itemId("album", "となりのトトロ", "Joe Hisaishi");
  const b = itemId("album", "オン・ギター", "Joe Hisaishi");
  assert.notEqual(a, b);
});

test("the fallback id is stable across runs", () => {
  assert.equal(
    itemId("album", "となりのトトロ", "Joe Hisaishi"),
    itemId("album", "となりのトトロ", "Joe Hisaishi")
  );
});

test("a title that slugs to nothing and has no creator still gets an id", () => {
  const id = itemId("album", "★★★");
  assert.notEqual(id, "album-");
  assert.match(id, /^album-[a-z0-9]+$/);
});

/* The normal path must not move: every existing id is derived from the title
   alone, so bringing the creator in as an argument cannot change them. */
test("a title with Latin characters ignores the creator entirely", () => {
  assert.equal(itemId("album", "Kind of Blue", "Miles Davis"), "album-kind-of-blue");
  assert.equal(itemId("album", "Kind of Blue"), "album-kind-of-blue");
});
