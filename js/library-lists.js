/* Media-specific list and catalog pages. The moving corridor is decorative;
   the catalog underneath owns all navigation and accessible media names. */

const DATA_URL = "data/library.json?v=catalog-taxonomy1";

const PAGE = {
  book: {
    label: "Books",
    singular: "book",
    title: "Book lists.",
    section: "Book lists",
    intro: "Ranked favorites, generous recommendations, and shelves organized around an idea.",
    creatorLabel: "Authors",
    lists: ["My top 25 books", "Science fiction essentials", "Books I keep giving away"],
  },
  album: {
    label: "Albums",
    singular: "album",
    title: "Album lists.",
    section: "Album lists",
    intro: "Records grouped by mood, era, genre, and the ones worth playing all the way through.",
    creatorLabel: "Artists and bands",
    lists: ["Top 10 hip-hop albums", "Records for a slow Sunday", "Perfect front-to-back albums"],
  },
  film: {
    label: "Films",
    singular: "film",
    title: "Film lists.",
    section: "Film lists",
    intro: "Movies gathered by genre, decade, audience, and the arguments they inspire.",
    creatorLabel: "Directors",
    lists: ["20 science fiction movies", "Top 10 children's movies", "Top 10 seventies movies"],
  },
  other: {
    label: "Podcasts",
    singular: "podcast",
    title: "Podcast lists.",
    section: "Podcast lists",
    intro: "Shows and episodes for long drives, curious afternoons, and repeat listening.",
    creatorLabel: "Hosts and makers",
    lists: ["Shows that make me smarter", "Long drives, better company", "Episodes worth replaying"],
  },
};

const LEGACY_HASH = { books: "book", albums: "album", films: "film", podcasts: "other" };
const params = new URLSearchParams(location.search);
const requested = params.get("type");
const legacy = LEGACY_HASH[location.hash.slice(1)];
const type = PAGE[requested] ? requested : PAGE[legacy] ? legacy : "book";
const page = PAGE[type];
const node = (selector) => document.querySelector(selector);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches || params.get("motion") === "reduce";
if (reducedMotion) document.documentElement.classList.add("reduce-motion");

function hrefFor(filter, value) {
  const next = new URLSearchParams({ type });
  if (filter && value) next.set(filter, value);
  return `library-lists.html?${next.toString()}#catalog`;
}

function corridorKeyframes(direction, name) {
  const path = {
    perspective: 30,
    cardHeight: 25,
    birthHeight: 2.6,
    exitHeight: 46,
    railBirth: -11,
    railExit: 44,
    fan: 3.3,
    turnBirth: 6,
    turnExit: 28,
    stops: 24,
  };
  const steps = [];
  for (let step = 0; step <= path.stops; step += 1) {
    const progress = step / path.stops;
    const scale =
      (path.birthHeight / path.cardHeight) *
      Math.pow(path.exitHeight / path.birthHeight, progress);
    const z = path.perspective * (1 - 1 / scale);
    const rail = path.railExit -
      (path.railExit - path.railBirth) * Math.pow(1 - progress, path.fan);
    const turn = path.turnBirth + (path.turnExit - path.turnBirth) * progress;
    steps.push(
      `${(progress * 100).toFixed(2)}%{transform:translate3d(${(direction * rail).toFixed(2)}cqw,0,${z.toFixed(2)}cqw) rotateY(${(-direction * turn).toFixed(2)}deg)}`
    );
  }
  return `@keyframes ${name}{${steps.join("")}}`;
}

function renderStream(items) {
  const stream = node("[data-list-stream]");
  if (!stream || !items.length) return;

  const style = document.createElement("style");
  style.textContent =
    corridorKeyframes(1, "list-stream-right") +
    corridorKeyframes(-1, "list-stream-left");
  document.head.append(style);

  const stage = document.createElement("div");
  stage.className = "list-stream-stage";
  const cards = Math.min(10, Math.max(8, items.length));
  const speed = 19;

  for (const [side, animation] of [["right", "list-stream-right"], ["left", "list-stream-left"]]) {
    for (let index = 0; index < cards; index += 1) {
      const item = items[index % items.length];
      const card = document.createElement("div");
      card.className = `list-stream-card is-${type} is-${side}`;
      card.style.setProperty("--stream-animation", animation);
      card.style.setProperty("--stream-speed", `${speed}s`);
      card.style.setProperty("--stream-delay", `${-(index * speed) / cards}s`);
      const img = document.createElement("img");
      img.src = item.cover;
      img.alt = "";
      img.decoding = "async";
      img.draggable = false;
      card.append(img);
      stage.append(card);
    }
  }
  stream.append(stage);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      stage.classList.toggle("is-paused", !entry.isIntersecting);
    }).observe(stream);
  }
}

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

function countsFor(items, values) {
  const counts = new Map();
  for (const item of items) {
    for (const value of values(item)) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
}

function filterLink(filter, value, count, current) {
  const link = document.createElement("a");
  link.href = hrefFor(filter, value);
  link.className = "catalog-filter-link";
  if (current === value) link.setAttribute("aria-current", "page");
  const label = document.createElement("span");
  label.textContent = value;
  const total = document.createElement("small");
  total.textContent = String(count).padStart(2, "0");
  link.append(label, total);
  return link;
}

function creatorLinks(item) {
  const wrap = document.createElement("p");
  wrap.className = "catalog-card-creator";
  (item.creators || [item.creator]).forEach((creator, index, creators) => {
    const link = document.createElement("a");
    link.href = hrefFor("creator", creator);
    link.textContent = creator;
    wrap.append(link);
    if (index < creators.length - 1) wrap.append(document.createTextNode(", "));
  });
  return wrap;
}

function catalogCard(item) {
  const card = document.createElement("article");
  card.className = `catalog-card is-${type}`;
  const imageWrap = document.createElement("div");
  imageWrap.className = "catalog-card-image";
  const img = document.createElement("img");
  img.src = item.cover;
  img.alt = `${item.title} cover`;
  img.loading = "lazy";
  img.decoding = "async";
  imageWrap.append(img);

  const body = document.createElement("div");
  body.className = "catalog-card-body";
  const title = document.createElement("h3");
  title.textContent = item.title;
  const meta = document.createElement("p");
  meta.className = "catalog-card-meta";
  meta.textContent = item.year ? String(item.year) : "Year unavailable";
  const genres = document.createElement("div");
  genres.className = "catalog-card-genres";
  for (const genre of item.genres) {
    const link = document.createElement("a");
    link.href = hrefFor("genre", genre);
    link.textContent = genre;
    genres.append(link);
  }
  body.append(title, creatorLinks(item), meta, genres);
  card.append(imageWrap, body);
  return card;
}

function renderCatalog(media) {
  const genreCounts = countsFor(media, (item) => item.genres || []);
  const creatorCounts = countsFor(media, (item) => item.creators || [item.creator]);
  const requestedGenre = params.get("genre");
  const requestedCreator = params.get("creator");
  const genre = genreCounts.find(([value]) => value.toLowerCase() === requestedGenre?.toLowerCase())?.[0] || null;
  const creator = creatorCounts.find(([value]) => value.toLowerCase() === requestedCreator?.toLowerCase())?.[0] || null;

  const genreLinks = node("[data-genre-links]");
  const creatorLinksNode = node("[data-creator-links]");
  genreCounts.forEach(([value, count]) => genreLinks.append(filterLink("genre", value, count, genre)));
  creatorCounts.forEach(([value, count]) => creatorLinksNode.append(filterLink("creator", value, count, creator)));

  const filtered = genre
    ? media.filter((item) => item.genres.includes(genre))
    : creator
      ? media.filter((item) => (item.creators || [item.creator]).includes(creator))
      : media;
  const title = genre ? `${genre} ${page.label.toLowerCase()}.` : creator ? `${creator}.` : `All ${page.label.toLowerCase()}.`;
  node("[data-catalog-title]").textContent = title;
  node("[data-catalog-count]").textContent = `${filtered.length} ${filtered.length === 1 ? page.singular : page.label.toLowerCase()} catalogued`;
  node("[data-creator-heading]").textContent = page.creatorLabel;

  const reset = node("[data-catalog-reset]");
  reset.href = hrefFor();
  reset.textContent = `View all ${page.label.toLowerCase()}`;
  reset.hidden = !genre && !creator;

  const grid = node("[data-catalog-grid]");
  filtered.forEach((item) => grid.append(catalogCard(item)));
}

async function main() {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error(`Could not load catalog: ${response.status}`);
  const { items } = await response.json();
  const media = items.filter((item) => item.type === type);
  const grid = node("[data-list-grid]");
  if (!grid || !media.length) return;

  node("[data-list-kicker]").textContent = page.label;
  node("[data-list-title]").textContent = page.title;
  node("[data-list-intro]").textContent = page.intro;
  node("[data-list-section]").textContent = page.section;
  node("[data-list-count]").textContent = `${page.lists.length} collections`;
  page.lists.forEach((title, index) => grid.append(listCard(title, media, index)));

  renderStream(media);
  renderCatalog(media);
  document.title = `${page.section} | Library`;
  document.body.dataset.listType = type;
}

main().catch((error) => {
  console.error(error);
  node("[data-catalog-count]").textContent = "The catalog could not be loaded.";
});
