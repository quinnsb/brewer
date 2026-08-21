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

test("imported finished date survives unless frontmatter overrides it", () => {
  const imported = { ...RAW, finished: "2026-08-21" };
  assert.equal(mergeItem(imported, null, false).finished, "2026-08-21");
  assert.equal(mergeItem(imported, "---\nfinished: 2026-08-22\n---\n", false).finished, "2026-08-22");
});

test("rating is author-owned frontmatter and defaults to null", () => {
  assert.equal(mergeItem(RAW, null, false).rating, null);
  assert.equal(mergeItem(RAW, "---\nrating: 4.5\n---\n", false).rating, 4.5);
});

test("a rating outside 0 to 5 is dropped and warned about by name", () => {
  const warnings = [];
  const out = mergeItem(RAW, "---\nrating: 9\n---\n", false, (m) => warnings.push(m));
  assert.equal(out.rating, null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /film-paris-texas-film/);
  assert.match(warnings[0], /9/);
});

test("a rating off the half step is dropped and warned about", () => {
  const warnings = [];
  const out = mergeItem(RAW, "---\nrating: 3.7\n---\n", false, (m) => warnings.push(m));
  assert.equal(out.rating, null);
  assert.equal(warnings.length, 1);
});

test("a non-numeric rating is dropped and warned about", () => {
  const warnings = [];
  const out = mergeItem(RAW, "---\nrating: great\n---\n", false, (m) => warnings.push(m));
  assert.equal(out.rating, null);
  assert.equal(warnings.length, 1);
});

test("valid half-step ratings pass through without warning", () => {
  for (const value of [0, 0.5, 3, 4.5, 5]) {
    const warnings = [];
    const out = mergeItem(RAW, `---\nrating: ${value}\n---\n`, false, (m) => warnings.push(m));
    assert.equal(out.rating, value, `rating ${value} should survive`);
    assert.deepEqual(warnings, [], `rating ${value} should not warn`);
  }
});

test("a negative rating is dropped and warned about", () => {
  const warnings = [];
  assert.equal(mergeItem(RAW, "---\nrating: -1\n---\n", false, (m) => warnings.push(m)).rating, null);
  assert.equal(warnings.length, 1);
});
