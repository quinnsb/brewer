import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGoodreads, parseLetterboxd, fullSizeGoodreadsCover, biggerLetterboxdPoster,
  feedUrls, newCandidates,
} from "../../api/lib/feeds.mjs";

/* Trimmed from the real feeds, keeping every shape that matters: CDATA, escaped
   entities, an unrated item, and an item with no read date. */
const GOODREADS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title><![CDATA[Quinn's bookshelf: read]]></title>
  <item>
    <guid><![CDATA[https://www.goodreads.com/review/show/4613578216]]></guid>
    <title><![CDATA[The Way of Kings (The Stormlight Archive, #1)]]></title>
    <link><![CDATA[https://www.goodreads.com/review/show/4613578216]]></link>
    <book_id>7235533</book_id>
    <book_large_image_url><![CDATA[https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1659905828l/7235533._SY475_.jpg]]></book_large_image_url>
    <book_description><![CDATA[<b>Long description</b> with markup.]]></book_description>
    <author_name>Brandon Sanderson</author_name>
    <isbn>0765326353</isbn>
    <user_rating>5</user_rating>
    <user_read_at><![CDATA[Sun, 1 Dec 2024 00:00:00 +0000]]></user_read_at>
    <book_published>2010</book_published>
    <num_pages>1007</num_pages>
  </item>
  <item>
    <title><![CDATA[Cat &amp; Mouse]]></title>
    <link><![CDATA[https://www.goodreads.com/review/show/2]]></link>
    <book_id>99</book_id>
    <book_large_image_url><![CDATA[https://i.gr-assets.com/images/S/x/99._SX98_.jpg]]></book_large_image_url>
    <author_name>Someone Else</author_name>
    <user_rating>0</user_rating>
    <user_read_at></user_read_at>
    <book_published>1994</book_published>
    <num_pages></num_pages>
  </item>
</channel></rss>`;

const LETTERBOXD = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org"><channel>
  <item> <title>Disclosure Day, 2026 - ★★★½</title>
    <link>https://letterboxd.com/quinnsb/film/disclosure-day/</link>
    <guid isPermaLink="false">letterboxd-watch-1439305913</guid>
    <letterboxd:watchedDate>2026-08-07</letterboxd:watchedDate>
    <letterboxd:rewatch>No</letterboxd:rewatch>
    <letterboxd:filmTitle>Disclosure Day</letterboxd:filmTitle>
    <letterboxd:filmYear>2026</letterboxd:filmYear>
    <letterboxd:memberRating>3.5</letterboxd:memberRating>
    <tmdb:movieId>1275779</tmdb:movieId>
    <description><![CDATA[ <p><img src="https://a.ltrbxd.com/resized/film-poster/1/1/5/9/2/5/1/1159251-disclosure-day-0-600-0-900-crop.jpg?v=9ae810e4bb"/></p> ]]></description>
  </item>
  <item> <title>Deadpool &amp; Wolverine, 2024 - ★★★</title>
    <link>https://letterboxd.com/quinnsb/film/deadpool-wolverine/</link>
    <letterboxd:watchedDate>2026-07-26</letterboxd:watchedDate>
    <letterboxd:filmTitle>Deadpool &amp; Wolverine</letterboxd:filmTitle>
    <letterboxd:filmYear>2024</letterboxd:filmYear>
    <letterboxd:memberRating>3.0</letterboxd:memberRating>
    <description><![CDATA[ <p><img src="https://a.ltrbxd.com/resized/film-poster/4/6/2/8/7/0/462870-deadpool-wolverine-0-600-0-900-crop.jpg?v=1aa778d2c6"/></p> ]]></description>
  </item>
  <item> <title>A list I made</title>
    <link>https://letterboxd.com/quinnsb/list/best-of/</link>
    <description><![CDATA[<p>Not a diary entry, so not a candidate.</p>]]></description>
  </item>
</channel></rss>`;

/* ---------- cover URLs ---------- */

/* This is the whole reason books can be high res without an API key: Open
   Library's best for this book is 185x276, and the stripped Goodreads URL is
   1400x2100. */
test("stripping the Goodreads size suffix asks for the original", () => {
  assert.equal(
    fullSizeGoodreadsCover("https://i.gr-assets.com/images/S/x/7235533._SY475_.jpg"),
    "https://i.gr-assets.com/images/S/x/7235533.jpg"
  );
  assert.equal(
    fullSizeGoodreadsCover("https://i.gr-assets.com/images/S/x/99._SX98_.jpg"),
    "https://i.gr-assets.com/images/S/x/99.jpg"
  );
});

test("a Goodreads URL with no size suffix is left alone", () => {
  assert.equal(
    fullSizeGoodreadsCover("https://i.gr-assets.com/images/S/x/7235533.jpg"),
    "https://i.gr-assets.com/images/S/x/7235533.jpg"
  );
  assert.equal(fullSizeGoodreadsCover(""), "");
  assert.equal(fullSizeGoodreadsCover(null), null);
});

test("Letterboxd posters are asked for at a useful size", () => {
  assert.equal(
    biggerLetterboxdPoster("https://a.ltrbxd.com/resized/film-poster/1/2/3-x-0-600-0-900-crop.jpg?v=9ae"),
    "https://a.ltrbxd.com/resized/film-poster/1/2/3-x-0-1000-0-1500-crop.jpg"
  );
});

test("a poster URL that does not carry a size is left alone but loses its cache buster", () => {
  assert.equal(
    biggerLetterboxdPoster("https://a.ltrbxd.com/resized/film-poster/odd.jpg?v=1"),
    "https://a.ltrbxd.com/resized/film-poster/odd.jpg"
  );
});

/* ---------- Goodreads ---------- */

test("a Goodreads item becomes a book candidate", () => {
  const [book] = parseGoodreads(GOODREADS);
  assert.equal(book.type, "book");
  assert.equal(book.title, "The Way of Kings (The Stormlight Archive, #1)");
  assert.equal(book.creator, "Brandon Sanderson");
  assert.equal(book.year, 2010);
  assert.equal(book.rating, 5);
  assert.equal(book.finished, "2024-12-01");
  assert.equal(book.detail, "1007 pages");
  assert.equal(book.source, "goodreads");
  assert.match(book.coverUrl, /7235533\.jpg$/);
});

test("the long HTML book description never becomes a fact", () => {
  const [book] = parseGoodreads(GOODREADS);
  for (const [, value] of book.facts) assert.doesNotMatch(String(value), /<b>|markup/);
});

/* A Goodreads rating of 0 means unrated, not zero stars, and writing 0 would
   put a real zero-star rating on the site. */
test("a Goodreads rating of zero is no rating at all", () => {
  const [, second] = parseGoodreads(GOODREADS);
  assert.equal(second.rating, null);
});

test("a missing read date and page count are null, not empty strings", () => {
  const [, second] = parseGoodreads(GOODREADS);
  assert.equal(second.finished, null);
  assert.equal(second.detail, "Book");
});

test("escaped entities are decoded in titles", () => {
  const [, second] = parseGoodreads(GOODREADS);
  assert.equal(second.title, "Cat & Mouse");
});

test("an empty feed parses to nothing rather than throwing", () => {
  assert.deepEqual(parseGoodreads("<rss><channel></channel></rss>"), []);
  assert.deepEqual(parseGoodreads(""), []);
});

/* ---------- Letterboxd ---------- */

test("a Letterboxd diary entry becomes a film candidate", () => {
  const [film] = parseLetterboxd(LETTERBOXD);
  assert.equal(film.type, "film");
  assert.equal(film.title, "Disclosure Day");
  assert.equal(film.year, 2026);
  assert.equal(film.rating, 3.5);
  assert.equal(film.finished, "2026-08-07");
  assert.equal(film.source, "letterboxd");
  assert.match(film.coverUrl, /0-1000-0-1500-crop\.jpg$/);
});

/* The feed carries lists and reviews as well as diary entries. Only something
   actually watched on a date is a candidate. */
test("feed entries that are not diary entries are ignored", () => {
  const films = parseLetterboxd(LETTERBOXD);
  assert.equal(films.length, 2);
  assert.ok(!films.some((film) => film.title.includes("list")));
});

test("an ampersand in a film title survives the feed", () => {
  const [, second] = parseLetterboxd(LETTERBOXD);
  assert.equal(second.title, "Deadpool & Wolverine");
});

/* Letterboxd has no director in the feed, and inventing one would be worse
   than leaving it for the resolver to fill in. */
test("a film candidate carries no invented creator", () => {
  const [film] = parseLetterboxd(LETTERBOXD);
  assert.equal(film.creator, "");
});

/* ---------- diffing ---------- */

test("candidates already in the library are dropped", () => {
  const candidates = [
    { type: "book", title: "Piranesi" },
    { type: "book", title: "The Way of Kings (The Stormlight Archive, #1)" },
  ];
  const fresh = newCandidates(candidates, [{ id: "book-piranesi" }]);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].id, "book-the-way-of-kings-the-stormlight-archive-1");
});

test("the same title twice in one feed only offers once", () => {
  const fresh = newCandidates(
    [{ type: "film", title: "Moonlight" }, { type: "film", title: "Moonlight" }],
    []
  );
  assert.equal(fresh.length, 1);
});

/* A rewatch is a second diary entry for a film already on the shelf. Keeping
   the newest means the rating shown is the one Quinn holds now. */
test("of two entries for one film the newer is kept", () => {
  const fresh = newCandidates(
    [
      { type: "film", title: "Moonlight", finished: "2024-01-01", rating: 4 },
      { type: "film", title: "Moonlight", finished: "2026-05-02", rating: 5 },
    ],
    []
  );
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].rating, 5);
  assert.equal(fresh[0].finished, "2026-05-02");
});

/* ---------- source config ---------- */

test("feed urls are built from the identities, not hardcoded", () => {
  const urls = feedUrls({ goodreads: { userId: "132056152" }, letterboxd: { username: "quinnsb" } });
  assert.equal(urls.goodreads, "https://www.goodreads.com/review/list_rss/132056152?shelf=read");
  assert.equal(urls.letterboxd, "https://letterboxd.com/quinnsb/rss/");
});

test("a missing identity means that feed is simply not fetched", () => {
  const urls = feedUrls({ letterboxd: { username: "quinnsb" } });
  assert.equal(urls.goodreads, null);
  assert.ok(urls.letterboxd);
  assert.deepEqual(feedUrls({}), { goodreads: null, letterboxd: null });
});

/* An id in the URL is the whole authorisation story for these feeds, so a
   crafted one must not be able to point the fetch somewhere else. */
test("identities that are not plain handles are refused", () => {
  assert.throws(() => feedUrls({ goodreads: { userId: "1/../../evil" } }), /not a valid/i);
  assert.throws(() => feedUrls({ letterboxd: { username: "a b" } }), /not a valid/i);
  assert.throws(() => feedUrls({ letterboxd: { username: "https://evil.com/" } }), /not a valid/i);
});
