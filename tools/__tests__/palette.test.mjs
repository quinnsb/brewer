import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprint, applyPalette, refreshPaletteCache, FALLBACK_PALETTE } from "../lib/palette.mjs";

const ITEMS = [
  { id: "book-a", cover: "images/library/book-a.jpg" },
  { id: "album-b", cover: "images/library/album-b.jpg" },
];

const ENTRY = {
  fingerprint: "100:5",
  width: 400,
  height_px: 600,
  palette: { cover: "#112233", accent: "#ffcc00", ink: "#f1ece3" },
};

/* A cache entry is only reusable if the cover file is byte-identical, so the
   fingerprint has to move when either size or mtime moves. */
test("fingerprint changes when the cover file changes", () => {
  assert.equal(fingerprint({ size: 100, mtimeMs: 5 }), fingerprint({ size: 100, mtimeMs: 5.4 }));
  assert.notEqual(fingerprint({ size: 100, mtimeMs: 5 }), fingerprint({ size: 101, mtimeMs: 5 }));
  assert.notEqual(fingerprint({ size: 100, mtimeMs: 5 }), fingerprint({ size: 100, mtimeMs: 9000 }));
});

test("applyPalette merges cached values onto items", () => {
  const [a] = applyPalette(ITEMS, { "book-a": ENTRY });
  assert.deepEqual(a.palette, ENTRY.palette);
  assert.equal(a.width, 400);
  assert.equal(a.height_px, 600);
});

test("applyPalette falls back rather than leaving palette undefined", () => {
  const [, b] = applyPalette(ITEMS, { "book-a": ENTRY });
  assert.deepEqual(b.palette, FALLBACK_PALETTE);
});

test("applyPalette does not mutate the items it is given", () => {
  const items = [{ id: "book-a", cover: "x.jpg" }];
  applyPalette(items, { "book-a": ENTRY });
  assert.equal(items[0].palette, undefined);
});

test("a cache hit costs no measurement", () => {
  return refreshPaletteCache(ITEMS, { "book-a": ENTRY, "album-b": ENTRY }, {
    stat: async () => ({ size: 100, mtimeMs: 5 }),
    measure: async () => assert.fail("should not measure a cache hit"),
  }).then(({ computed }) => assert.equal(computed, 0));
});

test("a changed cover is remeasured and the cache updated", async () => {
  const measured = [];
  const { cache, computed } = await refreshPaletteCache(ITEMS, { "book-a": ENTRY, "album-b": ENTRY }, {
    stat: async (file) => ({ size: file.includes("book-a") ? 999 : 100, mtimeMs: 5 }),
    measure: async () => {
      measured.push(1);
      return { width: 10, height_px: 20, px: Array(64).fill([10, 20, 30]) };
    },
  });
  assert.equal(computed, 1);
  assert.equal(measured.length, 1);
  assert.equal(cache["book-a"].width, 10);
  assert.equal(cache["book-a"].fingerprint, fingerprint({ size: 999, mtimeMs: 5 }));
  assert.equal(cache["album-b"].width, 400, "the unchanged entry should be left alone");
});

test("an unreadable cover falls back instead of failing the build", async () => {
  const { cache, missed } = await refreshPaletteCache([ITEMS[0]], {}, {
    stat: async () => { throw new Error("ENOENT"); },
    measure: async () => assert.fail("should not measure a file it cannot stat"),
  });
  assert.equal(missed, 1);
  assert.deepEqual(cache["book-a"].palette, FALLBACK_PALETTE);
});

test("entries for items that no longer exist are pruned", async () => {
  const { cache } = await refreshPaletteCache([ITEMS[0]], { "book-a": ENTRY, "gone-c": ENTRY }, {
    stat: async () => ({ size: 100, mtimeMs: 5 }),
    measure: async () => assert.fail("no measurement expected"),
  });
  assert.deepEqual(Object.keys(cache), ["book-a"]);
});
