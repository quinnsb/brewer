import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeItem } from "../lib/merge.mjs";

const RAW = {
  id: "film-paris-texas-film",
  type: "film",
  title: "Paris, Texas (film)",
  creator: "Wim Wenders",
  year: 1984,
  cover: "images/library/film-paris-texas-film.jpg",
  starred: false,
  note: null,
};

test("passes raw through untouched when there is no note", () => {
  const out = mergeItem(RAW, null, false);
  assert.equal(out.title, "Paris, Texas (film)");
  assert.equal(out.reviewHtml, null);
  assert.equal(out.starred, false);
  assert.equal(out.cover, "images/library/film-paris-texas-film.jpg");
});

test("frontmatter overrides synced metadata", () => {
  const out = mergeItem(RAW, "---\ntitle: Paris, Texas\nstarred: true\n---\n\nGood.", false);
  assert.equal(out.title, "Paris, Texas");
  assert.equal(out.starred, true);
  assert.equal(out.reviewHtml, "<p>Good.</p>");
});

test("absent frontmatter keys do not clobber synced values", () => {
  const out = mergeItem(RAW, "---\nstarred: true\n---\n\nGood.", false);
  assert.equal(out.title, "Paris, Texas (film)");
  assert.equal(out.creator, "Wim Wenders");
  assert.equal(out.year, 1984);
});

test("a note with no body yields a null review, not an empty paragraph", () => {
  const out = mergeItem(RAW, "---\nstarred: true\n---\n", false);
  assert.equal(out.reviewHtml, null);
});

test("override cover wins over the synced cover", () => {
  const out = mergeItem(RAW, null, true);
  assert.equal(out.cover, "images/library/overrides/film-paris-texas-film.jpg");
});

test("starred defaults to false when frontmatter omits it", () => {
  const out = mergeItem(RAW, "Just prose.", false);
  assert.equal(out.starred, false);
  assert.equal(out.reviewHtml, "<p>Just prose.</p>");
});

test("finished is null when absent", () => {
  assert.equal(mergeItem(RAW, null, false).finished, null);
  assert.equal(mergeItem(RAW, "---\nfinished: 2026-03\n---\n", false).finished, "2026-03");
});
