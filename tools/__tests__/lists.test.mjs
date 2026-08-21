import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateLists, resolveLists, createList, updateList, deleteList,
  addToList, removeFromList, moveInList,
} from "../lib/lists.mjs";

const ITEMS = [
  { id: "book-piranesi", type: "book", title: "Piranesi", cover: "images/library/book-piranesi.jpg", aspect: 0.66 },
  { id: "book-blood-meridian", type: "book", title: "Blood Meridian", cover: "images/library/book-blood-meridian.jpg", aspect: 0.66 },
  { id: "book-housekeeping", type: "book", title: "Housekeeping", cover: "images/library/book-housekeeping.jpg", aspect: 0.66 },
  { id: "film-moonlight", type: "film", title: "Moonlight", cover: "images/library/film-moonlight.jpg", aspect: 0.68 },
];

const LIST = {
  id: "top-books", type: "book", title: "My top books", intro: "The short shelf.",
  ranked: true, items: ["book-piranesi", "book-housekeeping"],
};

/* ---------- validation ---------- */

test("a well formed set of lists validates clean", () => {
  const { warnings } = validateLists([LIST], ITEMS);
  assert.deepEqual(warnings, []);
});

test("duplicate list ids are refused", () => {
  assert.throws(() => validateLists([LIST, { ...LIST, title: "Another" }], ITEMS), /duplicate list id/i);
});

test("an unknown type is refused", () => {
  assert.throws(() => validateLists([{ ...LIST, type: "vinyl" }], ITEMS), /unknown type/i);
});

test("a list must have an id and a title", () => {
  assert.throws(() => validateLists([{ ...LIST, id: "" }], ITEMS), /needs an id/i);
  assert.throws(() => validateLists([{ ...LIST, title: "   " }], ITEMS), /needs a title/i);
});

/* A film in a book list would render at the wrong aspect and be unreachable
   from the film page, so it is a structural error rather than a warning. */
test("a list cannot hold an item of another type", () => {
  assert.throws(
    () => validateLists([{ ...LIST, items: ["book-piranesi", "film-moonlight"] }], ITEMS),
    /film-moonlight is a film/i
  );
});

test("the same item twice in one list is refused", () => {
  assert.throws(
    () => validateLists([{ ...LIST, items: ["book-piranesi", "book-piranesi"] }], ITEMS),
    /listed twice/i
  );
});

/* An item can legitimately leave the library after a list was built, and that
   must not fail a build. It is reported and dropped, not thrown. */
test("an item that has left the library is a warning, not an error", () => {
  const { warnings } = validateLists([{ ...LIST, items: ["book-piranesi", "book-gone"] }], ITEMS);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /book-gone/);
});

test("an empty list is allowed, because a list is drafted before it is filled", () => {
  const { warnings } = validateLists([{ ...LIST, items: [] }], ITEMS);
  assert.deepEqual(warnings, []);
});

/* ---------- resolution ---------- */

test("resolving turns ids into items and keeps the authored order", () => {
  const [list] = resolveLists([{ ...LIST, items: ["book-housekeeping", "book-piranesi"] }], ITEMS);
  assert.deepEqual(list.items.map((item) => item.id), ["book-housekeeping", "book-piranesi"]);
  assert.equal(list.count, 2);
});

test("resolving drops ids that no longer exist rather than yielding holes", () => {
  const [list] = resolveLists([{ ...LIST, items: ["book-gone", "book-piranesi"] }], ITEMS);
  assert.deepEqual(list.items.map((item) => item.id), ["book-piranesi"]);
  assert.equal(list.count, 1);
});

test("resolving carries title, intro and ranked through", () => {
  const [list] = resolveLists([LIST], ITEMS);
  assert.equal(list.title, "My top books");
  assert.equal(list.intro, "The short shelf.");
  assert.equal(list.ranked, true);
});

/* ---------- editing ---------- */

test("creating derives an id from the title and keeps it unique", () => {
  const one = createList([], { type: "book", title: "My Top 25 Books" });
  assert.equal(one.at(-1).id, "my-top-25-books");
  const two = createList(one, { type: "book", title: "My Top 25 Books" });
  assert.equal(two.at(-1).id, "my-top-25-books-2");
  const three = createList(two, { type: "book", title: "My Top 25 Books" });
  assert.equal(three.at(-1).id, "my-top-25-books-3");
});

test("a new list starts empty, unranked and introless", () => {
  const [list] = createList([], { type: "film", title: "Seventies" });
  assert.deepEqual(list.items, []);
  assert.equal(list.ranked, false);
  assert.equal(list.intro, "");
  assert.equal(list.type, "film");
});

test("creating refuses a title that slugs to nothing", () => {
  assert.throws(() => createList([], { type: "book", title: "!!!" }), /needs a title/i);
});

test("retitling does not change the id, because the id is a URL", () => {
  const lists = updateList([LIST], "top-books", { title: "The short shelf", intro: "New words." });
  assert.equal(lists[0].id, "top-books");
  assert.equal(lists[0].title, "The short shelf");
  assert.equal(lists[0].intro, "New words.");
});

test("updating an unknown list is refused", () => {
  assert.throws(() => updateList([LIST], "nope", { title: "x" }), /no list/i);
});

test("neither type nor items can be changed by an update", () => {
  const lists = updateList([LIST], "top-books", { type: "film", items: [], ranked: true });
  assert.equal(lists[0].type, "book");
  assert.deepEqual(lists[0].items, LIST.items);
});

test("deleting removes one list and leaves the rest alone", () => {
  const lists = deleteList([LIST, { ...LIST, id: "other" }], "top-books");
  assert.deepEqual(lists.map((l) => l.id), ["other"]);
  assert.throws(() => deleteList([LIST], "nope"), /no list/i);
});

test("adding appends, and adding twice is refused", () => {
  const lists = addToList([LIST], "top-books", "book-blood-meridian", ITEMS);
  assert.deepEqual(lists[0].items, ["book-piranesi", "book-housekeeping", "book-blood-meridian"]);
  assert.throws(() => addToList([LIST], "top-books", "book-piranesi", ITEMS), /already/i);
});

test("adding the wrong type or an unknown id is refused", () => {
  assert.throws(() => addToList([LIST], "top-books", "film-moonlight", ITEMS), /is a film/i);
  assert.throws(() => addToList([LIST], "top-books", "book-nope", ITEMS), /not in the library/i);
});

test("removing takes the item out and leaves order intact", () => {
  const lists = removeFromList([{ ...LIST, items: ["book-piranesi", "book-housekeeping", "book-blood-meridian"] }], "top-books", "book-housekeeping");
  assert.deepEqual(lists[0].items, ["book-piranesi", "book-blood-meridian"]);
});

test("removing something not in the list is refused", () => {
  assert.throws(() => removeFromList([LIST], "top-books", "book-blood-meridian"), /not in that list/i);
});

test("moving swaps with the neighbour in the given direction", () => {
  const three = { ...LIST, items: ["a", "b", "c"] };
  assert.deepEqual(moveInList([three], "top-books", "b", -1)[0].items, ["b", "a", "c"]);
  assert.deepEqual(moveInList([three], "top-books", "b", 1)[0].items, ["a", "c", "b"]);
});

/* The first item cannot move up and the last cannot move down. Returning the
   list unchanged means the admin can wire the buttons without guarding. */
test("moving past either end is a no-op rather than an error", () => {
  const three = { ...LIST, items: ["a", "b", "c"] };
  assert.deepEqual(moveInList([three], "top-books", "a", -1)[0].items, ["a", "b", "c"]);
  assert.deepEqual(moveInList([three], "top-books", "c", 1)[0].items, ["a", "b", "c"]);
});

test("every edit returns new objects rather than mutating the old ones", () => {
  const original = JSON.stringify([LIST]);
  const lists = [LIST];
  addToList(lists, "top-books", "book-blood-meridian", ITEMS);
  removeFromList(lists, "top-books", "book-piranesi");
  moveInList(lists, "top-books", "book-piranesi", 1);
  updateList(lists, "top-books", { title: "changed" });
  assert.equal(JSON.stringify(lists), original);
});
