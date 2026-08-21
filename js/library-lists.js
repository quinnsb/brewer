/* Dedicated media-list landing pages. One template serves books, albums,
   films, and podcasts while each URL keeps its own title and content. */

const DATA_URL = "data/library.json?v=unique-albums1";

const PAGE = {
  book: {
    label: "Books",
    title: "Book lists.",
    section: "Book lists",
    intro: "Ranked favorites, generous recommendations, and shelves organized around an idea.",
    lists: ["My top 25 books", "Science fiction essentials", "Books I keep giving away"],
  },
  album: {
    label: "Albums",
    title: "Album lists.",
    section: "Album lists",
    intro: "Records grouped by mood, era, genre, and the ones worth playing all the way through.",
    lists: ["Top 10 hip-hop albums", "Records for a slow Sunday", "Perfect front-to-back albums"],
  },
  film: {
    label: "Films",
    title: "Film lists.",
    section: "Film lists",
    intro: "Movies gathered by genre, decade, audience, and the arguments they inspire.",
    lists: ["20 science fiction movies", "Top 10 children's movies", "Top 10 seventies movies"],
  },
  other: {
    label: "Podcasts",
    title: "Podcast lists.",
    section: "Podcast lists",
    intro: "Shows and episodes for long drives, curious afternoons, and repeat listening.",
    lists: ["Shows that make me smarter", "Long drives, better company", "Episodes worth replaying"],
  },
};

const LEGACY_HASH = {
  books: "book",
  albums: "album",
  films: "film",
  podcasts: "other",
};

const requested = new URLSearchParams(location.search).get("type");
const legacy = LEGACY_HASH[location.hash.slice(1)];
const type = PAGE[requested] ? requested : PAGE[legacy] ? legacy : "book";
const page = PAGE[type];

const node = (selector) => document.querySelector(selector);

function preview(items, offset) {
  const frame = document.createElement("div");
  frame.className = `list-card-preview is-${type}`;
  frame.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 6; index += 1) {
    const item = items[(offset + index) % items.length];
    const img = document.createElement("img");
    img.src = item.cover;
    img.alt = "";
    img.loading = "lazy";
    img.draggable = false;
    img.style.aspectRatio = String(item.aspect || 1);
    frame.append(img);
  }

  return frame;
}

function listCard(title, items, index) {
  const card = document.createElement("article");
  card.className = "list-card";

  const body = document.createElement("div");
  body.className = "list-card-body";

  const heading = document.createElement("h3");
  heading.textContent = title;
  const status = document.createElement("p");
  status.textContent = "List coming later";
  body.append(heading, status);
  card.append(body, preview(items, index * 4));
  return card;
}

async function main() {
  const { items } = await (await fetch(DATA_URL)).json();
  const media = items.filter((item) => item.type === type);
  const grid = node("[data-list-grid]");
  if (!grid || !media.length) return;

  node("[data-list-kicker]").textContent = page.label;
  node("[data-list-title]").textContent = page.title;
  node("[data-list-intro]").textContent = page.intro;
  node("[data-list-section]").textContent = page.section;
  node("[data-list-count]").textContent = `${page.lists.length} collections`;
  page.lists.forEach((title, index) => grid.append(listCard(title, media, index)));

  document.title = `${page.section} | Library`;
  document.body.dataset.listType = type;
}

main();
