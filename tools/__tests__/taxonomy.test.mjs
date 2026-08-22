import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTaxonomy } from "../lib/taxonomy.mjs";

test("adds authored genres to every item", () => {
  const items = applyTaxonomy(
    [{ id: "album-one", title: "One" }],
    { "album-one": ["Indie rock", "Indie rock", "Pop"] }
  );
  assert.deepEqual(items[0].genres, ["Indie rock", "Pop"]);
  assert.deepEqual(items[0].creators, []);
});

/* "Unknown" used to be substituted here, which put a director called Unknown in
   the catalog filter and on the byline of 87 films. An absent creator is now
   absent all the way through, and every consumer checks before it renders. */
test("a missing creator yields no creators rather than a placeholder", () => {
  const items = applyTaxonomy(
    [
      { id: "film-one", type: "film", creator: "" },
      { id: "film-two", type: "film" },
      { id: "book-one", type: "book", creator: "   " },
    ],
    { "film-one": ["Drama"], "film-two": ["Drama"], "book-one": ["Fantasy"] }
  );
  assert.deepEqual(items[0].creators, []);
  assert.deepEqual(items[1].creators, []);
  assert.deepEqual(items[2].creators, []);
});

test("keeps bands intact and separates co-directors", () => {
  const items = applyTaxonomy(
    [
      { id: "album-one", type: "album", creator: "Earth, Wind & Fire" },
      { id: "film-one", type: "film", creator: "John Musker, Ron Clements" },
    ],
    { "album-one": ["Funk"], "film-one": ["Animation"] }
  );
  assert.deepEqual(items[0].creators, ["Earth, Wind & Fire"]);
  assert.deepEqual(items[1].creators, ["John Musker", "Ron Clements"]);
});

test("fails when a catalog item has no genre assignment", () => {
  assert.throws(
    () => applyTaxonomy([{ id: "book-new" }], {}),
    /Missing genres for book-new/
  );
});

test("fails when taxonomy contains an obsolete item id", () => {
  assert.throws(
    () => applyTaxonomy([{ id: "book-one" }], { "book-one": ["Fantasy"], "book-old": ["Mystery"] }),
    /unknown item ids: book-old/
  );
});

test("uses imported genres when an item has no authored taxonomy yet", () => {
  const [item] = applyTaxonomy([{ id: "book-imported", type: "book", creator: "A", genres: ["Science Fiction"] }], {});
  assert.deepEqual(item.genres, ["Science Fiction"]);
});
