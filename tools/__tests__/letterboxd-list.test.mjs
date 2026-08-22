import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFilmGrid, splitDisplayName, lastPage, filmsPageUrl } from "../../lib/letterboxd-list.mjs";

/* Trimmed from a real page, keeping the shapes that matter: a rated film, an
   unrated one, and an escaped ampersand in a title. */
const GRID = `
<ul class="poster-list">
  <li class="griditem">
    <div class="react-component" data-target-link="/film/the-drama/"
      data-item-full-display-name="The Drama (2026)"></div>
    <p class="poster-viewingdata">
      <span class="rating -micro -darker rated-8">★★★★</span>
    </p>
  </li>
  <li class="griditem">
    <div class="react-component" data-target-link="/film/deadpool-wolverine/"
      data-item-full-display-name="Deadpool &amp; Wolverine (2024)"></div>
    <p class="poster-viewingdata">
      <span class="rating -micro -darker rated-9">★★★★½</span>
    </p>
  </li>
  <li class="griditem">
    <div class="react-component" data-target-link="/film/the-lobster/"
      data-item-full-display-name="The Lobster (2015)"></div>
    <p class="poster-viewingdata"></p>
  </li>
</ul>
<div class="paginate-pages"><a href="/quinnsb/films/page/2/">2</a><a href="/quinnsb/films/page/3/">3</a></div>`;

test("a rated film carries its title, year and rating out of five", () => {
  const [first] = parseFilmGrid(GRID);
  assert.equal(first.type, "film");
  assert.equal(first.title, "The Drama");
  assert.equal(first.year, 2026);
  assert.equal(first.rating, 4);
  assert.equal(first.letterboxdSlug, "the-drama");
});

/* rated-N counts half stars, so an odd N is a half rating. */
test("an odd rated-N is a half star", () => {
  const [, second] = parseFilmGrid(GRID);
  assert.equal(second.rating, 4.5);
});

test("an escaped ampersand survives", () => {
  const [, second] = parseFilmGrid(GRID);
  assert.equal(second.title, "Deadpool & Wolverine");
});

/* Watched and not scored is a real state, not a parse failure. */
test("a film with no rating span is unrated rather than skipped", () => {
  const films = parseFilmGrid(GRID);
  assert.equal(films.length, 3);
  assert.equal(films[2].title, "The Lobster");
  assert.equal(films[2].rating, null);
});

/* Splitting on the list item is what keeps a rating with its own poster. */
test("a rating never leaks onto the next film", () => {
  const films = parseFilmGrid(GRID);
  assert.deepEqual(films.map((f) => f.rating), [4, 4.5, null]);
});

test("the year comes off the end, and only when it looks like one", () => {
  assert.deepEqual(splitDisplayName("Alien (1979)"), { title: "Alien", year: 1979 });
  assert.deepEqual(splitDisplayName("Nine (Nine)"), { title: "Nine (Nine)", year: null });
  assert.deepEqual(splitDisplayName("Untitled"), { title: "Untitled", year: null });
});

test("the pager gives the page count, and no pager means one page", () => {
  assert.equal(lastPage(GRID), 3);
  assert.equal(lastPage("<html></html>"), 1);
});

test("page urls are built from the username, and a bad one is refused", () => {
  assert.equal(filmsPageUrl("quinnsb"), "https://letterboxd.com/quinnsb/films/");
  assert.equal(filmsPageUrl("quinnsb", 3), "https://letterboxd.com/quinnsb/films/page/3/");
  assert.throws(() => filmsPageUrl("../../evil"), /not a valid/i);
  assert.throws(() => filmsPageUrl("has space"), /not a valid/i);
});

test("markup with no grid items parses to nothing rather than throwing", () => {
  assert.deepEqual(parseFilmGrid("<html></html>"), []);
  assert.deepEqual(parseFilmGrid(""), []);
});
