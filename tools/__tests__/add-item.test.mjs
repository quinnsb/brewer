import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { rawItemFor, seedFor, addToCatalog } from "../../lib/add-item.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const load = async (f) => JSON.parse(await readFile(path.join(ROOT, f), "utf8"));

const raw = await load("data/library.raw.json");
const published = await load("data/library.json");
const taxonomy = await load("data/library-taxonomy.json");
const listening = await load("data/library-listening.json");
const palette = await load("data/library-palette.json");

const CANDIDATE = {
  type: "book", title: "A Brand New Book", creator: "Someone Real", year: 2024,
  detail: "288 pages", sourceUrl: "https://openlibrary.org/works/OLXXXW",
  facts: [["Author", "Someone Real"], ["Pages", 288], ["Publisher", null]],
};

const PALETTE_ENTRY = { fingerprint: null, width: 400, height_px: 600, palette: { cover: "#123456", accent: "#abcdef", ink: "#f1ece3" } };

/* A new item has to be indistinguishable in shape from one sync produced, or
   the shelf renders it differently from its neighbours. */
test("a new raw item carries every key a synced item carries", () => {
  const item = rawItemFor(CANDIDATE);
  const reference = raw.items.find((i) => i.type === "book");
  assert.deepEqual(Object.keys(item).sort(), Object.keys(reference).sort());
});

test("shape, aspect and geometry come from the type and the id", () => {
  const item = rawItemFor(CANDIDATE);
  assert.equal(item.id, "book-a-brand-new-book");
  assert.equal(item.shape, "spine");
  assert.equal(item.aspect, 0.66);
  assert.ok(item.height >= 0.45 && item.height <= 1);
  assert.ok(item.thickness >= 0.6 && item.thickness <= 1.5);
});

test("null facts are dropped rather than rendered as blanks", () => {
  assert.deepEqual(rawItemFor(CANDIDATE).facts, [["Author", "Someone Real"], ["Pages", 288]]);
});

test("a title is required and an unknown type is refused", () => {
  assert.throws(() => rawItemFor({ ...CANDIDATE, title: "  " }), /title is required/i);
  assert.throws(() => rawItemFor({ ...CANDIDATE, type: "vinyl" }), /unknown type/i);
});

test("the seed pins title and creator so a resync cannot rename the item", () => {
  const seed = seedFor(rawItemFor(CANDIDATE));
  assert.equal(seed.title, "A Brand New Book");
  assert.equal(seed.creator, "Someone Real");
  assert.equal(seed.type, "book");
  assert.match(seed.query, /A Brand New Book/);
});

test("adding appends to raw, additions and published alike", () => {
  const out = addToCatalog({
    published, raw, additions: null, taxonomy, listening, palette,
    candidate: CANDIDATE, genres: ["Science fiction"], paletteEntry: PALETTE_ENTRY,
  });
  assert.equal(out.files.raw.items.length, raw.items.length + 1);
  assert.equal(out.files.published.items.length, published.items.length + 1);
  assert.equal(out.files.additions.items.length, 1);
  assert.equal(out.files.additions.source, "library-admin");
});

test("the published item carries its genres and its sampled palette", () => {
  const out = addToCatalog({
    published, raw, additions: null, taxonomy, listening, palette,
    candidate: CANDIDATE, genres: ["Science fiction"], paletteEntry: PALETTE_ENTRY,
  });
  assert.deepEqual(out.item.genres, ["Science fiction"]);
  assert.deepEqual(out.item.palette, PALETTE_ENTRY.palette);
  assert.equal(out.item.reviewHtml, null);
  assert.equal(out.item.rating, null);
});

test("adding something already present is refused", () => {
  assert.throws(
    () => addToCatalog({
      published, raw, additions: null, taxonomy, listening, palette,
      candidate: { type: "book", title: "The Left Hand of Darkness", creator: "Ursula K. Le Guin" },
    }),
    /already in the library/i
  );
});

test("existing entries are never mutated", () => {
  const before = JSON.stringify(raw.items);
  addToCatalog({ published, raw, additions: null, taxonomy, listening, palette, candidate: CANDIDATE, genres: ["Science fiction"], paletteEntry: PALETTE_ENTRY });
  assert.equal(JSON.stringify(raw.items), before);
});

test("an item added without a sampled palette still gets a usable one", () => {
  const out = addToCatalog({ published, raw, additions: null, taxonomy, listening, palette, candidate: CANDIDATE, genres: ["Science fiction"] });
  assert.ok(out.item.palette.cover, "should fall back rather than leave palette undefined");
});

/* Genres are not optional metadata here: the catalog filters are built from
   them, so an item without any is invisible to the browse page. */
test("adding without a genre is refused with a reason", () => {
  assert.throws(
    () => addToCatalog({ published, raw, additions: null, taxonomy, listening, palette, candidate: CANDIDATE, genres: [] }),
    /at least one genre/i
  );
  assert.throws(
    () => addToCatalog({ published, raw, additions: null, taxonomy, listening, palette, candidate: CANDIDATE, genres: ["  "] }),
    /at least one genre/i
  );
});
