import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter } from "../lib/frontmatter.mjs";

test("parses keys and body", () => {
  const { data, body } = parseFrontmatter(
    "---\nstarred: true\nyear: 1984\ntitle: Paris, Texas\n---\n\nWenders shoots.\n"
  );
  assert.equal(data.starred, true);
  assert.equal(data.year, 1984);
  assert.equal(data.title, "Paris, Texas");
  assert.equal(body, "Wenders shoots.");
});

test("handles a file with no frontmatter", () => {
  const { data, body } = parseFrontmatter("Just a review.\n");
  assert.deepEqual(data, {});
  assert.equal(body, "Just a review.");
});

test("handles frontmatter with no body", () => {
  const { data, body } = parseFrontmatter("---\nstarred: true\n---\n");
  assert.equal(data.starred, true);
  assert.equal(body, "");
});

test("keeps colons inside values", () => {
  const { data } = parseFrontmatter("---\ntitle: Blade Runner: The Final Cut\n---\n");
  assert.equal(data.title, "Blade Runner: The Final Cut");
});

test("treats false and 0 as their literal types", () => {
  const { data } = parseFrontmatter("---\nstarred: false\nyear: 0\n---\n");
  assert.equal(data.starred, false);
  assert.equal(data.year, 0);
});
