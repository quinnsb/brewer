import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFilmGrid, splitDisplayName, lastPage, filmsPageUrl,
  parseListPage, lastListPage, listTitle, listPageUrl,
} from "../../lib/letterboxd-list.mjs";

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

/* ---------- list pages ----------
   Trimmed from a real list page. A list entry is a different shape from a grid
   entry in every part that matters, so these are pinned separately: the
   container class, the attribute holding the name, and the rating living on
   the <li> as the owner's score out of ten rather than in a span.

   The encodings are theirs too: an apostrophe arrives as &#039; and an accented
   letter arrives as itself, in UTF-8, so those are what is pinned here rather
   than whichever escapes seemed likely. */
const LIST = `
<ul class="poster-list -p125 film-list">
  <li class="posteritem numbered-list-item" data-owner-rating="10" data-object-id="filmListEntry:1" >
    <div class="react-component" data-item-name="Spirited Away (2001)"
      data-item-slug="spirited-away" data-item-link="/film/spirited-away/"></div>
  </li>
  <li class="posteritem numbered-list-item" data-owner-rating="9" data-object-id="filmListEntry:2" >
    <div class="react-component" data-item-name="Kiki&#039;s Delivery Service (1989)"
      data-item-slug="kikis-delivery-service" data-item-link="/film/kikis-delivery-service/"></div>
  </li>
  <li class="posteritem numbered-list-item" data-object-id="filmListEntry:3" >
    <div class="react-component" data-item-name="Nausicaä of the Valley of the Wind (1984)"
      data-item-slug="nausicaa-of-the-valley-of-the-wind" data-item-link="/film/n/"></div>
  </li>
</ul>
<div class="paginate-pages"><a href="/somebody/list/pixar-ranked/page/2/">2</a><a href="/somebody/list/pixar-ranked/page/3/">3</a></div>`;

test("a list entry gives up its title, year, slug and the owner's rating", () => {
  const films = parseListPage(LIST);
  assert.equal(films.length, 3);
  assert.deepEqual(films[0], {
    type: "film", title: "Spirited Away", year: 2001,
    rating: 5, letterboxdSlug: "spirited-away",
  });
  assert.equal(films[1].title, "Kiki's Delivery Service");
  assert.equal(films[1].rating, 4.5);
});

test("an unrated list entry is unrated, not zero", () => {
  assert.equal(parseListPage(LIST)[2].rating, null);
});

test("order is preserved, because on a ranked list the order is the ranking", () => {
  assert.deepEqual(parseListPage(LIST).map((f) => f.title), [
    "Spirited Away", "Kiki's Delivery Service", "Nausicaä of the Valley of the Wind",
  ]);
});

test("the grid parser finds nothing in a list page, and the list parser nothing in a grid", () => {
  assert.equal(parseFilmGrid(LIST).length, 0);
  assert.equal(parseListPage(GRID).length, 0);
});

test("the pager gives the page count, and its absence means one page", () => {
  assert.equal(lastListPage(LIST, "pixar-ranked"), 3);
  assert.equal(lastListPage(LIST, "wes-anderson-ranked"), 1);
  assert.equal(lastListPage("<ul></ul>", "pixar-ranked"), 1);
});

test("the list is named what its author named it", () => {
  assert.equal(listTitle('<meta property="og:title" content="Hayao Miyazaki, Ranked" />'), "Hayao Miyazaki, Ranked");
  assert.equal(listTitle("<html></html>"), null);
});

test("list urls are built, and a bad username or slug is refused", () => {
  assert.equal(listPageUrl("somebody", "pixar-ranked"), "https://letterboxd.com/somebody/list/pixar-ranked/");
  assert.equal(listPageUrl("somebody", "pixar-ranked", 2), "https://letterboxd.com/somebody/list/pixar-ranked/page/2/");
  assert.throws(() => listPageUrl("../etc", "pixar-ranked"));
  assert.throws(() => listPageUrl("somebody", "../../etc"));
});
