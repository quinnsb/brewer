import { test } from "node:test";
import assert from "node:assert/strict";
import { librarySchema, SCHEMA_TYPE } from "../lib/schema.mjs";

const ITEMS = [
  {
    id: "book-a", type: "book", title: "A Wizard of Earthsea", creator: "Ursula K. Le Guin",
    creators: ["Ursula K. Le Guin"], year: 1968, rating: 5, genres: ["Fantasy"],
    cover: "images/library/book-a.jpg", sourceUrl: "https://example.com/a",
  },
  {
    id: "album-b", type: "album", title: "Kind of Blue", creator: "Miles Davis",
    creators: ["Miles Davis"], year: 1959, genres: ["Jazz"], cover: "images/library/album-b.jpg",
  },
  {
    id: "film-c", type: "film", title: "Parasite", creator: "", creators: [],
    year: 2019, rating: 5, externalRating: 8.5, genres: ["Thriller"],
    cover: "images/library/film-c.jpg",
  },
  {
    id: "other-d", type: "other", title: "99% Invisible", creator: "Roman Mars",
    creators: ["Roman Mars"], year: 2026, genres: ["Design"], cover: "images/library/other-d.jpg",
  },
];

const SITE = "https://www.quinnbrewer.com";

test("each medium maps to its own schema.org type", () => {
  assert.equal(SCHEMA_TYPE.book, "Book");
  assert.equal(SCHEMA_TYPE.album, "MusicAlbum");
  assert.equal(SCHEMA_TYPE.film, "Movie");
  assert.equal(SCHEMA_TYPE.other, "PodcastSeries");
});

test("the whole library is one ItemList of four collections", () => {
  const schema = librarySchema(ITEMS, SITE);
  assert.equal(schema["@context"], "https://schema.org");
  assert.equal(schema["@type"], "ItemList");
  assert.equal(schema.itemListElement.length, 4);
  assert.deepEqual(
    schema.itemListElement.map((entry) => entry.item["@type"]),
    ["Book", "MusicAlbum", "Movie", "PodcastSeries"]
  );
});

test("positions run from one and carry the item name", () => {
  const [first] = librarySchema(ITEMS, SITE).itemListElement;
  assert.equal(first.position, 1);
  assert.equal(first["@type"], "ListItem");
  assert.equal(first.item.name, "A Wizard of Earthsea");
});

test("a creator becomes an author, a byArtist, or a director as the type needs", () => {
  const [book, album, film] = librarySchema(ITEMS, SITE).itemListElement.map((e) => e.item);
  assert.deepEqual(book.author, [{ "@type": "Person", name: "Ursula K. Le Guin" }]);
  assert.deepEqual(album.byArtist, [{ "@type": "MusicGroup", name: "Miles Davis" }]);
  assert.equal("director" in film, false, "a film with no director claims none");
});

test("cover paths become absolute urls", () => {
  const [book] = librarySchema(ITEMS, SITE).itemListElement.map((e) => e.item);
  assert.equal(book.image, "https://www.quinnbrewer.com/images/library/book-a.jpg");
});

test("a personal rating becomes a Rating on a five point scale", () => {
  const [book, album] = librarySchema(ITEMS, SITE).itemListElement.map((e) => e.item);
  assert.equal(book.review.reviewRating.ratingValue, 5);
  assert.equal(book.review.reviewRating.bestRating, 5);
  assert.equal(book.review.author.name, "Quinn Brewer");
  assert.equal("review" in album, false, "an unrated record claims no rating");
});

test("the output is valid json and carries no undefined holes", () => {
  const text = JSON.stringify(librarySchema(ITEMS, SITE));
  assert.equal(text.includes("undefined"), false);
  assert.doesNotThrow(() => JSON.parse(text));
});
