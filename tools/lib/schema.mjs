/* ============================================================
   SCHEMA — the library as schema.org structured data

   A page listing 185 rated works is exactly what structured data is for, and
   the library had none. Written by the build rather than kept by hand in the
   markup, so it cannot drift from what the page actually renders.

   One ItemList holding Book, MusicAlbum, Movie and PodcastSeries entries. Any
   field the item does not have is left out rather than emitted empty: a Person
   named "" is worse than no author at all, which is the same mistake the
   "Unknown" director was.
   ============================================================ */

export const SCHEMA_TYPE = {
  book: "Book",
  album: "MusicAlbum",
  film: "Movie",
  other: "PodcastSeries",
};

/* Which property carries the people, per type, and what those people are. */
const CREATOR_FIELD = {
  book: ["author", "Person"],
  album: ["byArtist", "MusicGroup"],
  film: ["director", "Person"],
  other: ["author", "Person"],
};

const RATING_MAX = 5;

function absolute(site, path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${site.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function itemSchema(item, site) {
  const type = SCHEMA_TYPE[item.type];
  if (!type) return null;

  const node = { "@type": type, name: item.title };

  const people = item.creators?.length ? item.creators : [item.creator].filter(Boolean);
  if (people.length) {
    const [field, personType] = CREATOR_FIELD[item.type];
    node[field] = people.map((name) => ({ "@type": personType, name }));
  }

  if (item.year) node.datePublished = String(item.year);
  if (item.genres?.length) node.genre = item.genres;

  const image = absolute(site, item.cover);
  if (image) node.image = image;
  if (item.sourceUrl) node.sameAs = item.sourceUrl;

  /* Quinn's own rating is a review, not an aggregate: it is one person's
     opinion and saying otherwise would be a lie about the data. */
  const rating = Number(item.rating);
  if (Number.isFinite(rating) && rating > 0) {
    node.review = {
      "@type": "Review",
      author: { "@type": "Person", name: "Quinn Brewer" },
      reviewRating: {
        "@type": "Rating",
        ratingValue: rating,
        bestRating: RATING_MAX,
        worstRating: 1,
      },
    };
  }

  return node;
}

export function librarySchema(items, site) {
  const entries = [];
  for (const item of items) {
    const node = itemSchema(item, site);
    if (!node) continue;
    entries.push({ "@type": "ListItem", position: entries.length + 1, item: node });
  }
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Quinn Brewer's library",
    description: "Books, records, films, and podcasts worth keeping.",
    numberOfItems: entries.length,
    itemListElement: entries,
  };
}
