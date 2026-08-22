import { test } from "node:test";
import assert from "node:assert/strict";
import { applyThumbs, refreshThumbs, thumbPath, thumbWebpPath, shelfWebpPath } from "../lib/thumbs.mjs";

const ITEMS = [
  { id: "book-a", cover: "images/library/book-a.jpg" },
  { id: "album-b", cover: "images/library/album-b.jpg" },
];

const stat = async () => ({ size: 100, mtimeMs: 5 });

/* Both derivatives come off the same source, so one encode call makes both and
   the cache carries both paths. */
function encoderSpy() {
  const calls = [];
  return {
    calls,
    encode: async (cover, targets) => {
      calls.push({ cover, targets });
      return { jpeg: 40_000, webp: 18_000, shelf: 4_000 };
    },
  };
}

test("a jpeg, a webp and a shelf-sized webp path come off the item id", () => {
  assert.equal(thumbPath("book-a"), "images/library/thumbs/book-a.jpg");
  assert.equal(thumbWebpPath("book-a"), "images/library/thumbs/book-a.webp");
  assert.equal(shelfWebpPath("book-a"), "images/library/thumbs/book-a-sm.webp");
});

test("a fresh build encodes both formats and caches both paths", async () => {
  const { encode, calls } = encoderSpy();
  const { cache, made } = await refreshThumbs(ITEMS, {}, { stat, encode });
  assert.equal(made, 2);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].targets, {
    jpeg: "images/library/thumbs/book-a.jpg",
    webp: "images/library/thumbs/book-a.webp",
    shelf: "images/library/thumbs/book-a-sm.webp",
  });
  assert.equal(cache["book-a"].thumb, "images/library/thumbs/book-a.jpg");
  assert.equal(cache["book-a"].thumbWebp, "images/library/thumbs/book-a.webp");
  assert.equal(cache["book-a"].shelfWebp, "images/library/thumbs/book-a-sm.webp");
});

test("an unchanged cover is not re-encoded", async () => {
  const { encode, calls } = encoderSpy();
  const previous = {
    "book-a": {
      fingerprint: "100:5",
      thumb: "images/library/thumbs/book-a.jpg",
      thumbWebp: "images/library/thumbs/book-a.webp",
      shelfWebp: "images/library/thumbs/book-a-sm.webp",
      bytes: 40_000,
    },
  };
  const { cache, made } = await refreshThumbs(ITEMS, previous, { stat, encode });
  assert.equal(made, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cover, "images/library/album-b.jpg");
  assert.equal(cache["book-a"], previous["book-a"]);
});

/* A cache written before webp existed has a jpeg but no webp. Reusing it as-is
   would mean that cover never gets one, so it counts as a miss and re-encodes. */
test("a cache entry from before webp is refreshed rather than trusted", async () => {
  const { encode, calls } = encoderSpy();
  const stale = {
    "book-a": { fingerprint: "100:5", thumb: "images/library/thumbs/book-a.jpg", bytes: 40_000 },
  };
  const { cache } = await refreshThumbs([ITEMS[0]], stale, { stat, encode });
  assert.equal(calls.length, 1);
  assert.equal(cache["book-a"].thumbWebp, "images/library/thumbs/book-a.webp");
});

test("a cover that cannot be read leaves the item with no thumb at all", async () => {
  const { encode } = encoderSpy();
  const failing = async () => { throw new Error("ENOENT"); };
  const { cache, missed } = await refreshThumbs(ITEMS, {}, { stat: failing, encode });
  assert.equal(missed, 2);
  assert.deepEqual(cache, {});
});

test("applyThumbs attaches both paths, and neither when there is no entry", () => {
  const [a, b] = applyThumbs(ITEMS, {
    "book-a": {
      thumb: "images/library/thumbs/book-a.jpg",
      thumbWebp: "images/library/thumbs/book-a.webp",
      shelfWebp: "images/library/thumbs/book-a-sm.webp",
    },
  });
  assert.equal(a.thumb, "images/library/thumbs/book-a.jpg");
  assert.equal(a.thumbWebp, "images/library/thumbs/book-a.webp");
  assert.equal(a.shelfWebp, "images/library/thumbs/book-a-sm.webp");
  assert.equal(b.thumb, undefined);
  assert.equal(b.thumbWebp, undefined);
});

test("the items given are never mutated", async () => {
  const { encode } = encoderSpy();
  await refreshThumbs(ITEMS, {}, { stat, encode });
  assert.equal("thumb" in ITEMS[0], false);
});
