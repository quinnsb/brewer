/* Media-specific list and catalog pages. The moving corridor is decorative;
   the catalog underneath owns all navigation and accessible media names. */

import { wireExpansion, coverPicture, wireDrag, wireLoopRail } from "./library.js?v=library-detail12";

/* Revalidated on every load (see the fetch below) rather than trusted from
   cache, because this file is rewritten by every `node tools/library-build.mjs`
   run and the version below only moves when someone remembers to move it. The
   cost is one conditional request that normally answers 304. */
const DATA_URL = "data/library.json?v=library-detail12";
const LISTS_URL = "data/library-lists.json?v=library-detail12";

const PAGE = {
  book: {
    label: "Books",
    singular: "book",
    title: "Book lists.",
    section: "Book lists",
    intro: "Ranked favorites, generous recommendations, and shelves organized around an idea.",
    creatorControlLabel: "Author",
    creatorControlAll: "All authors",
  },
  album: {
    label: "Albums",
    singular: "album",
    title: "Album lists.",
    section: "Album lists",
    intro: "Records grouped by mood, era, genre, and the ones worth playing all the way through.",
    creatorControlLabel: "Artist or band",
    creatorControlAll: "All artists",
  },
  film: {
    label: "Films",
    singular: "film",
    title: "Film lists.",
    section: "Film lists",
    intro: "Movies gathered by genre, decade, audience, and the arguments they inspire.",
    creatorControlLabel: "Director",
    creatorControlAll: "All directors",
  },
  other: {
    label: "Podcasts",
    singular: "podcast",
    title: "Podcast lists.",
    section: "Podcast lists",
    intro: "Shows and episodes for long drives, curious afternoons, and repeat listening.",
    creatorControlLabel: "Host or maker",
    creatorControlAll: "All hosts",
  },
};

const LEGACY_HASH = { books: "book", albums: "album", films: "film", podcasts: "other" };
const params = new URLSearchParams(location.search);
const requested = params.get("type");
const requestedList = params.get("list");
const legacy = LEGACY_HASH[location.hash.slice(1)];
/* A ?list= id carries its own type, so both are settled in main() once the
   lists file has been read. Until then this is only the ?type= reading. */
let type = PAGE[requested] ? requested : PAGE[legacy] ? legacy : "book";
let page = PAGE[type];
const node = (selector) => document.querySelector(selector);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches || params.get("motion") === "reduce";
if (reducedMotion) document.documentElement.classList.add("reduce-motion");

function hrefFor(filter, value) {
  const next = new URLSearchParams({ type });
  if (filter && value) next.set(filter, value);
  return `library-lists?${next.toString()}#catalog`;
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
    turnExit: type === "film" || type === "book" ? 14 : 24,
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
  const cards = Math.min(10, Math.max(6, Math.ceil(items.length / 2)));
  const speed = 19;

  for (const [side, animation] of [["right", "list-stream-right"], ["left", "list-stream-left"]]) {
    const sideItems = items.filter((_, index) => index % 2 === (side === "right" ? 0 : 1));
    for (let index = 0; index < cards; index += 1) {
      const item = sideItems[index % sideItems.length] || items[index % items.length];
      const card = document.createElement("div");
      card.className = `list-stream-card is-${type} is-${side}`;
      card.style.setProperty("--stream-animation", animation);
      card.style.setProperty("--stream-speed", `${speed}s`);
      card.style.setProperty("--stream-delay", `${-(index * speed) / cards}s`);
      card.append(coverPicture(item, { tier: "card" }));
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

/* The list's own members, in the order they were put there. This used to wrap
   round the whole catalog with a modulo, which is how a list of nothing managed
   to show six covers.

   Every member, not the first six. It used to be a preview in the strict sense
   and stopped at six, which made a row that dead-ended a screen and a bit along
   and then simply refused to go further. These loop now, the same way the main
   page's shelves do, so a list is something you can keep pulling through in
   either direction; showing only six of them would make the loop a carousel of
   the same six covers.

   The three levels are what wireLoopRail needs: the frame is the thing that
   scrolls, the track is the flex row it clones runs into, and the run is what
   gets cloned. A shorter list simply does not meet the ratio to loop, and the
   rail leaves the clones hidden and behaves as an ordinary scroller. */
function preview(items) {
  const frame = document.createElement("div");
  frame.className = `list-card-preview is-${type}`;
  frame.setAttribute("aria-label", `${page.singular} list. Scroll or drag horizontally to browse.`);

  const track = document.createElement("div");
  track.className = "list-preview-track";
  const run = document.createElement("div");
  run.className = "list-preview-run";

  for (const item of items) {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "list-preview-trigger";
    trigger.dataset.id = item.id;
    trigger.setAttribute("aria-label", `Open ${item.title} details`);
    trigger.setAttribute("aria-expanded", "false");
    trigger.style.aspectRatio = String(item.aspect || 1);
    trigger.append(coverPicture(item, { tier: "shelf" }));
    run.append(trigger);
  }

  track.append(run);
  frame.append(track);
  /* Deferred: both of these measure, and neither can measure a row that is not
     in the document yet. */
  requestAnimationFrame(() => {
    wireLoopRail(frame, run);
    wireDrag(frame);
  });
  return frame;
}

function countLabel(count, ranked) {
  const noun = count === 1 ? page.singular : page.label.toLowerCase();
  return ranked ? `${count} ${noun}, ranked` : `${count} ${noun}`;
}

function listCard(list) {
  const card = document.createElement("article");
  card.className = "list-card";
  const body = document.createElement("div");
  body.className = "list-card-body";
  const heading = document.createElement("h3");
  const link = document.createElement("a");
  link.href = `library-lists?list=${encodeURIComponent(list.id)}`;
  link.textContent = list.title;
  heading.append(link);
  const count = document.createElement("p");
  count.textContent = countLabel(list.count, list.ranked);
  body.append(heading, count);
  card.append(body, preview(list.items));
  return card;
}

function countsFor(items, values) {
  const counts = new Map();
  for (const item of items) {
    for (const value of values(item)) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
}

function addOptions(select, counts, selected) {
  for (const [value, count] of counts) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = `${value} (${count})`;
    option.selected = selected?.toLowerCase() === value.toLowerCase();
    select.append(option);
  }
}

/* 87 films have no director. Returning null rather than an empty paragraph
   keeps the card from reserving a line for a byline it does not have. */
function creatorLinks(item) {
  const creators = item.creators?.length ? item.creators : [item.creator].filter(Boolean);
  if (!creators.length) return null;
  const wrap = document.createElement("p");
  wrap.className = "catalog-card-creator";
  creators.forEach((creator, index) => {
    const link = document.createElement("a");
    link.href = hrefFor("creator", creator);
    link.textContent = creator;
    wrap.append(link);
    if (index < creators.length - 1) wrap.append(document.createTextNode(", "));
  });
  return wrap;
}

function catalogCard(item, rank) {
  const card = document.createElement("article");
  card.className = `catalog-card is-${type}`;
  const imageWrap = document.createElement("button");
  imageWrap.type = "button";
  imageWrap.className = "catalog-card-image";
  imageWrap.dataset.id = item.id;
  imageWrap.setAttribute("aria-label", `Open ${item.title} details`);
  imageWrap.setAttribute("aria-expanded", "false");
  const picture = coverPicture(item, { tier: "card" });
  picture.querySelector("img").alt = `${item.title} cover`;
  imageWrap.append(picture);

  const body = document.createElement("div");
  body.className = "catalog-card-body";
  const title = document.createElement("h3");
  title.textContent = item.title;
  const meta = document.createElement("p");
  meta.className = "catalog-card-meta";
  const metadata = [item.year ? String(item.year) : "Year unavailable"];
  if (Number(item.rating) > 0) metadata.push(`Personal ${Number(item.rating).toFixed(1)} / 5`);
  if (Number(item.externalRating) > 0) metadata.push(`${EXTERNAL_RATING_LABEL} ${Number(item.externalRating).toFixed(1)} / 10`);
  meta.textContent = metadata.join(" · ");
  const genres = document.createElement("div");
  genres.className = "catalog-card-genres";
  for (const genre of item.genres) {
    const link = document.createElement("a");
    link.href = hrefFor("genre", genre);
    link.textContent = genre;
    genres.append(link);
  }
  if (rank) {
    const number = document.createElement("p");
    number.className = "catalog-card-rank";
    number.textContent = String(rank).padStart(2, "0");
    body.append(number);
  }
  body.append(title, ...[creatorLinks(item)].filter(Boolean), meta, genres);
  card.append(imageWrap, body);
  return card;
}

/* The outside score comes from TMDB, and the film panel has always said so.
   The sort control said "IMDb", which named a source the data never came from. */
const EXTERNAL_RATING_LABEL = "TMDB";

/* Only the sorts that mean something for this medium. These were hardcoded in
   the markup, which is how the books catalog came to offer a sort by film
   rating, on a field no book will ever carry. */
/* No `types` means every medium. A sort is also dropped when the medium has the
   field on paper but nothing in it, so an option can never do nothing. */
const SORTS = {
  title: { label: "Title" },
  creator: { label: "Creator" },
  year: { label: "Release date" },
  rating: { label: "My rating", field: "rating" },
  externalRating: {
    label: `${EXTERNAL_RATING_LABEL} rating`,
    types: ["film"],
    field: "externalRating",
  },
};

function sortsFor(media) {
  return Object.entries(SORTS).filter(([, sort]) => {
    if (sort.types && !sort.types.includes(type)) return false;
    if (sort.field) return media.some((item) => Number(item[sort.field]) > 0);
    return true;
  });
}

/* Every filter that is on, named the way the controls name it, so the heading
   and the empty state can both describe the same state in the same words. */
function activeFilters(genre, creator) {
  const active = [];
  if (genre) active.push({ control: "Genre", value: genre });
  if (creator) active.push({ control: page.creatorControlLabel, value: creator });
  return active;
}

/* "Fantasy books." used to be the whole heading even with an author selected,
   so two different filters produced the same title. A creator on its own leads
   with the medium, which is why that branch keeps the capitalised label. */
function catalogTitle(genre, creator) {
  const medium = page.label.toLowerCase();
  if (genre && creator) return `${genre} ${medium} by ${creator}.`;
  if (genre) return `${genre} ${medium}.`;
  if (creator) return `${page.label} by ${creator}.`;
  return `All ${medium}.`;
}

/* Nothing matched. This used to render an empty grid and leave the page as a
   blank gap above the footer, which reads as a broken page rather than an
   honest answer. */
function emptyState(genre, creator, onClear) {
  const wrap = document.createElement("div");
  wrap.className = "catalog-empty";
  const named = activeFilters(genre, creator).map((f) => `${f.control.toLowerCase()} ${f.value}`);
  const heading = document.createElement("p");
  heading.className = "catalog-empty-heading";
  /* Two filters clash with each other; one filter simply has nothing in it. The
     difference is what the reader needs to know, so the copy follows it. */
  heading.textContent = named.length === 2 ? "Nothing matches both of those." : "Nothing here yet.";
  const detail = document.createElement("p");
  detail.className = "catalog-empty-detail";
  detail.textContent = named.length === 2
    ? `There is no ${page.singular} filed under ${named[0]} and ${named[1]}. Dropping either one will bring results back.`
    : `Nothing in the ${page.label.toLowerCase()} catalog is filed under ${named[0]}.`;
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "catalog-empty-clear";
  clear.textContent = `Clear filters and show all ${page.label.toLowerCase()}`;
  clear.addEventListener("click", onClear);
  wrap.append(heading, detail, clear);
  return wrap;
}

function renderCatalog(media) {
  const genreSelect = node("[data-catalog-genre]");
  const creatorSelect = node("[data-catalog-creator]");
  const sortSelect = node("[data-catalog-sort]");
  const orderSelect = node("[data-catalog-order]");
  const requestedGenre = params.get("genre") || "";
  const requestedCreator = params.get("creator") || "";

  /* Built from the medium rather than the markup, so no catalog offers a sort
     on a field its items do not have. */
  sortSelect.replaceChildren(...sortsFor(media).map(([value, sort]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value === "creator" ? page.creatorControlLabel : sort.label;
    return option;
  }));
  const requestedSort = params.get("sort") || "title";
  sortSelect.value = [...sortSelect.options].some((o) => o.value === requestedSort) ? requestedSort : "title";
  orderSelect.value = params.get("order") || "asc";
  node("[data-creator-heading]").textContent = page.creatorControlLabel;
  const reset = node("[data-catalog-reset]");
  reset.href = hrefFor();
  reset.textContent = `View all ${page.label.toLowerCase()}`;
  const grid = node("[data-catalog-grid]");
  const count = node("[data-catalog-count]");

  const creatorsOf = (item) => (item.creators?.length ? item.creators : [item.creator].filter(Boolean));

  /* Each control offers what the other one leaves available, so a combination
     that matches nothing cannot be assembled from the dropdowns. The value in
     hand always stays selectable, otherwise choosing it would erase it. */
  const fillOptions = (genre, creator) => {
    const forGenres = creator ? media.filter((item) => creatorsOf(item).includes(creator)) : media;
    const forCreators = genre ? media.filter((item) => item.genres.includes(genre)) : media;
    genreSelect.replaceChildren(Object.assign(document.createElement("option"), {
      value: "", textContent: "All genres",
    }));
    creatorSelect.replaceChildren(Object.assign(document.createElement("option"), {
      /* Written out per medium rather than pluralised, because "All artist or
         bands" is not English. */
      value: "", textContent: page.creatorControlAll,
    }));
    addOptions(genreSelect, countsFor(forGenres, (item) => item.genres || []), genre);
    addOptions(creatorSelect, countsFor(forCreators, creatorsOf), creator);
    /* A filter arriving from the URL that the other filter rules out is still
       shown, so the page reflects its own address and the empty state can
       explain the clash. */
    if (genre && !genreSelect.value) addOptions(genreSelect, [[genre, 0]], genre);
    if (creator && !creatorSelect.value) addOptions(creatorSelect, [[creator, 0]], creator);
    genreSelect.value = genre;
    creatorSelect.value = creator;
  };

  fillOptions(requestedGenre, requestedCreator);

  const render = () => {
    const genre = genreSelect.value;
    const creator = creatorSelect.value;
    const sort = sortSelect.value;
    const direction = orderSelect.value === "desc" ? -1 : 1;
    fillOptions(genre, creator);
    const filtered = media.filter((item) =>
      (!genre || item.genres.includes(genre)) &&
      (!creator || creatorsOf(item).includes(creator))
    );
    const valueFor = (item) => {
      if (sort === "creator") return item.creator || "";
      if (sort === "year") return Number(item.year) || 0;
      if (sort === "rating") return Number(item.rating) || -1;
      if (sort === "externalRating") return Number(item.externalRating) || -1;
      return item.title;
    };
    filtered.sort((a, b) => {
      const av = valueFor(a);
      const bv = valueFor(b);
      const comparison = typeof av === "number" ? av - bv : av.localeCompare(bv);
      return comparison * direction;
    });
    const clearAll = () => {
      genreSelect.value = "";
      creatorSelect.value = "";
      render();
    };
    /* Passed through a lambda, not straight to map: map hands the index in as
       the second argument, which catalogCard reads as a rank, so the plain
       catalogue numbered every card after the first. Only a ranked list ranks. */
    if (filtered.length) grid.replaceChildren(...filtered.map((item) => catalogCard(item)));
    else grid.replaceChildren(emptyState(genre, creator, clearAll));
    grid.classList.toggle("is-empty", !filtered.length);
    node("[data-catalog-title]").textContent = catalogTitle(genre, creator);
    count.textContent = `${filtered.length} ${filtered.length === 1 ? page.singular : page.label.toLowerCase()} catalogued`;
    reset.hidden = !genre && !creator && sort === "title" && direction === 1;
    /* Rebuilt from scratch, so anything the page arrived with has to be put
       back deliberately. ?list= is the whole identity of a single list page:
       drop it here and a reload, or a copied URL, silently becomes the index. */
    const next = new URLSearchParams(requestedList ? { list: requestedList } : { type });
    if (genre) next.set("genre", genre);
    if (creator) next.set("creator", creator);
    if (sort !== "title") next.set("sort", sort);
    if (direction === -1) next.set("order", "desc");
    history.replaceState(null, "", `${location.pathname}?${next.toString()}${location.hash}`);
  };
  node("[data-catalog-controls]").addEventListener("change", render);
  render();
}

/* The index of every list for one medium. A list with no members is left off
   the page rather than shown as a promise, which is what the twelve hardcoded
   titles were. Drafts still exist in the data file and in the admin. */
function renderIndex(lists, grid) {
  const published = lists.filter((list) => list.count);
  node("[data-list-kicker]").textContent = page.label;
  node("[data-list-title]").textContent = page.title;
  node("[data-list-intro]").textContent = page.intro;
  node("[data-list-section]").textContent = page.section;
  node("[data-list-count]").textContent = published.length
    ? `${published.length} ${published.length === 1 ? "collection" : "collections"}`
    : "None yet";

  if (!published.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = `No ${page.singular} lists yet. The catalog below has every ${page.singular}.`;
    grid.replaceChildren(empty);
    return;
  }
  grid.replaceChildren(...published.map((list) => listCard(list)));
}

/* One list, in its authored order, numbered when it is ranked. */
function renderOneList(list, grid) {
  const kicker = node("[data-list-kicker]");
  const back = document.createElement("a");
  back.href = `library-lists?type=${type}`;
  back.textContent = page.label;
  kicker.replaceChildren(back, document.createTextNode(` / ${list.title}`));

  node("[data-list-title]").textContent = list.title;
  const intro = node("[data-list-intro]");
  intro.textContent = list.intro;
  intro.hidden = !list.intro;

  node("[data-list-section]").textContent = list.ranked ? "In rank order" : "On this list";
  node("[data-list-count]").textContent = countLabel(list.count, list.ranked);

  if (!list.count) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = "Nothing on this list yet.";
    grid.replaceChildren(empty);
    return;
  }

  /* Members read as catalog cards rather than the index's cover rail: on a page
     about one list, the titles and the years are the content. */
  grid.className = "catalog-grid";
  grid.replaceChildren(...list.items.map((item, index) => catalogCard(item, list.ranked ? index + 1 : 0)));
}

/* A list file that will not load is not a reason to lose the catalog, which is
   the part of this page that actually answers questions. */
async function loadLists() {
  try {
    const response = await fetch(LISTS_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(String(response.status));
    const lists = await response.json();
    return Array.isArray(lists) ? lists : [];
  } catch (error) {
    console.warn(`Could not load lists: ${error.message}`);
    return [];
  }
}

async function main() {
  const [response, lists] = await Promise.all([fetch(DATA_URL, { cache: "no-cache" }), loadLists()]);
  if (!response.ok) throw new Error(`Could not load catalog: ${response.status}`);
  const { items } = await response.json();

  /* A requested list decides the medium, so the whole page follows it. An id
     that no longer exists falls back to the index rather than a dead end. */
  const chosen = requestedList ? lists.find((list) => list.id === requestedList) : null;
  if (chosen) {
    type = chosen.type;
    page = PAGE[type];
  }

  const media = items.filter((item) => item.type === type);
  const grid = node("[data-list-grid]");
  if (!grid || !media.length) return;

  const byId = new Map(media.map((item) => [item.id, item]));
  const resolve = (list) => {
    const members = list.items.map((id) => byId.get(id)).filter(Boolean);
    return { ...list, items: members, count: members.length };
  };

  const one = chosen ? resolve(chosen) : null;
  if (one) renderOneList(one, grid);
  else renderIndex(lists.filter((list) => list.type === type).map(resolve), grid);

  /* Only a ranked list gives the detail panel a number to print. An unranked
     list, and the catalog, leave the panel with the medium alone. */
  const ranks = new Map(
    one?.ranked
      ? one.items.map((item, index) => [item.id, { position: index + 1, listTitle: one.title }])
      : []
  );

  /* The corridor is decoration, so it wants a set big enough to read as motion.
     A three-title list would just flash the same cover past repeatedly. */
  renderStream(one && one.count >= 3 ? one.items : media);
  renderCatalog(media);
  wireExpansion(media, node(".list-page-main"), ranks);
  document.title = chosen ? `${chosen.title} | Library` : `${page.section} | Library`;
  document.body.dataset.listType = type;
  if (chosen) document.body.dataset.listView = "single";
}

main().catch((error) => {
  console.error(error);
  node("[data-catalog-count]").textContent = "The catalog could not be loaded.";
});
