import { test } from "node:test";
import assert from "node:assert/strict";
import { applyWatching } from "../lib/watching.mjs";

const ITEMS = [
  { id: "film-moonlight", type: "film", title: "Moonlight" },
  { id: "book-piranesi", type: "book", title: "Piranesi" },
];

test("a film gains a trailer url and a no-cookie embed", () => {
  const [film] = applyWatching(ITEMS, { "film-moonlight": "9NJj12tJzqc" });
  assert.equal(film.trailerId, "9NJj12tJzqc");
  assert.equal(film.trailerUrl, "https://www.youtube.com/watch?v=9NJj12tJzqc");
  assert.match(film.trailerEmbedUrl, /^https:\/\/www\.youtube-nocookie\.com\/embed\/9NJj12tJzqc\?/);
  assert.match(film.trailerEmbedUrl, /rel=0/);
});

test("films with no trailer are returned untouched", () => {
  const [, book] = applyWatching(ITEMS, {});
  assert.equal(book.trailerId, undefined);
  assert.deepEqual(applyWatching(ITEMS, {}), ITEMS);
});

test("an id for something that is not a film is refused", () => {
  assert.throws(() => applyWatching(ITEMS, { "book-piranesi": "9NJj12tJzqc" }), /non-film/i);
});

test("an id for an item that does not exist is refused", () => {
  assert.throws(() => applyWatching(ITEMS, { "film-gone": "9NJj12tJzqc" }), /unknown item ids/i);
});

/* The id becomes part of a src attribute, so anything that is not a YouTube id
   must not get that far. */
test("anything that is not a YouTube id is refused", () => {
  for (const bad of ["../../evil", "short", "way-too-long-for-youtube", "abc<script>", "abcdefghij k"]) {
    assert.throws(() => applyWatching(ITEMS, { "film-moonlight": bad }), /Invalid YouTube/i, bad);
  }
});

/* An empty entry is how you say "no trailer for this one" without deleting the
   key, so it is ignored rather than treated as a broken id. */
test("an empty entry means no trailer, not a bad one", () => {
  const [film] = applyWatching(ITEMS, { "film-moonlight": "" });
  assert.equal(film.trailerId, undefined);
});

test("the items given are never mutated", () => {
  const before = JSON.stringify(ITEMS);
  applyWatching(ITEMS, { "film-moonlight": "9NJj12tJzqc" });
  assert.equal(JSON.stringify(ITEMS), before);
});
