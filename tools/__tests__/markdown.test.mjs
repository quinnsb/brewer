import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../lib/markdown.mjs";

test("wraps paragraphs split by blank lines", () => {
  assert.equal(renderMarkdown("One.\n\nTwo."), "<p>One.</p><p>Two.</p>");
});

test("joins soft-wrapped lines into one paragraph", () => {
  assert.equal(renderMarkdown("One\ntwo."), "<p>One two.</p>");
});

test("renders emphasis", () => {
  assert.equal(renderMarkdown("**bold** and *it*"), "<p><strong>bold</strong> and <em>it</em></p>");
});

test("renders links", () => {
  assert.equal(
    renderMarkdown("see [it](https://x.com)"),
    '<p>see <a href="https://x.com" rel="noopener">it</a></p>'
  );
});

test("escapes HTML so review text cannot inject markup", () => {
  assert.equal(
    renderMarkdown('<img src=x onerror="alert(1)">'),
    "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>"
  );
});

test("escapes quotes inside link hrefs", () => {
  assert.equal(
    renderMarkdown('[a](https://x.com/"onmouseover=)'),
    '<p><a href="https://x.com/&quot;onmouseover=" rel="noopener">a</a></p>'
  );
});

test("returns empty string for empty input", () => {
  assert.equal(renderMarkdown(""), "");
});
