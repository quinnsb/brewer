import { test } from "node:test";
import assert from "node:assert/strict";
import { applyExternalRatings } from "../lib/external-rating.mjs";

/* The catalog has always offered a sort by the outside rating, but the number
   only ever existed as a string inside `facts`, so `Number(item.externalRating)`
   was NaN for all 185 items and the sort compared -1 against -1. This promotes
   it to a real field once, at build time. */

test("promotes a TMDB rating out of facts into a number", () => {
  const [item] = applyExternalRatings([
    { id: "film-one", type: "film", facts: [["Released", "2019-05-30"], ["TMDB rating", "8.5"]] },
  ]);
  assert.equal(item.externalRating, 8.5);
});

test("leaves the facts table untouched", () => {
  const facts = [["TMDB rating", "7.9"]];
  const [item] = applyExternalRatings([{ id: "film-one", type: "film", facts }]);
  assert.deepEqual(item.facts, [["TMDB rating", "7.9"]]);
  assert.deepEqual(facts, [["TMDB rating", "7.9"]]);
});

test("an item with no outside rating gets null, not zero", () => {
  const [book, film] = applyExternalRatings([
    { id: "book-one", type: "book", facts: [["Pages", 418]] },
    { id: "film-two", type: "film" },
  ]);
  assert.equal(book.externalRating, null);
  assert.equal(film.externalRating, null);
});

test("a rating that is not a number is ignored rather than stored as NaN", () => {
  const [item] = applyExternalRatings([
    { id: "film-one", type: "film", facts: [["TMDB rating", "not rated"]] },
  ]);
  assert.equal(item.externalRating, null);
});

test("a rating outside the ten point scale is refused", () => {
  const [low, high] = applyExternalRatings([
    { id: "film-one", type: "film", facts: [["TMDB rating", "0"]] },
    { id: "film-two", type: "film", facts: [["TMDB rating", "11"]] },
  ]);
  assert.equal(low.externalRating, null);
  assert.equal(high.externalRating, null);
});

test("the items given are never mutated", () => {
  const items = [{ id: "film-one", type: "film", facts: [["TMDB rating", "8.5"]] }];
  applyExternalRatings(items);
  assert.equal("externalRating" in items[0], false);
});
