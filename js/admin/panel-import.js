/* Import. What Goodreads and Letterboxd have that the library does not.

   Nothing here writes on its own. A feed offers everything on the shelf,
   including the books that were started and abandoned, so each candidate is
   accepted or skipped by hand. Accepting runs it through /api/add, the same
   path the Add tab uses, so an imported item is indistinguishable from a
   hand-added one. Skipping is remembered, or the queue never empties.

   The rating and the date come from the feed, so an accepted item arrives
   already rated instead of needing a second pass in Rate & write. */

import { catalogue, library, imports } from "./api.js?v=admin1";
import { samplePalette } from "./palette-browser.js?v=admin1";

const TYPES = { book: "Books", film: "Films" };
const el = (tag, className, props = {}) => Object.assign(document.createElement(tag), { className, ...props });

const stars = (rating) =>
  rating == null ? "" : `${"★".repeat(Math.floor(rating))}${rating % 1 ? "½" : ""} ${rating}`;

export async function mount(panel) {
  panel.replaceChildren();
  const wrap = el("div", "im-wrap");
  const bar = el("div", "im-bar");
  const status = el("p", "im-status", { role: "status", textContent: "Reading the feeds" });
  const results = el("div", "im-results");
  wrap.append(bar, status, results);
  panel.append(wrap);

  /* Genres come from what the library already uses, so importing does not grow
     a second vocabulary alongside the one the Add tab maintains. */
  const catalog = await library.catalog();
  const byType = {};
  for (const item of catalog.items) {
    const counts = (byType[item.type] ||= new Map());
    for (const genre of item.genres || []) counts.set(genre, (counts.get(genre) || 0) + 1);
  }
  const allGenres = [...new Set(catalog.items.flatMap((item) => item.genres || []))].sort();
  const commonFor = (type) =>
    [...(byType[type] || new Map())]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([genre]) => genre);

  let candidates = [];
  let filter = "";

  const typeFilter = el("select", "", { "aria-label": "Filter by kind" });
  typeFilter.append(el("option", "", { value: "", textContent: "Everything" }));
  for (const [value, label] of Object.entries(TYPES)) {
    typeFilter.append(el("option", "", { value, textContent: label }));
  }
  typeFilter.addEventListener("change", () => {
    filter = typeFilter.value;
    draw();
  });

  const refresh = el("button", "is-quiet", { type: "button", textContent: "Check again" });
  refresh.addEventListener("click", load);
  bar.append(typeFilter, refresh);

  function draw() {
    const shown = filter ? candidates.filter((candidate) => candidate.type === filter) : candidates;
    results.replaceChildren(...shown.map(card));
    if (!shown.length) {
      results.append(el("p", "admin-placeholder", {
        textContent: candidates.length ? "Nothing of that kind is waiting." : "Nothing new in either feed.",
      }));
    }
  }

  async function load() {
    refresh.disabled = true;
    status.className = "im-status";
    status.textContent = "Reading the feeds";
    results.replaceChildren();
    try {
      const data = await imports.pending();
      candidates = data.candidates;
      const counts = Object.entries(TYPES)
        .map(([type, label]) => `${candidates.filter((c) => c.type === type).length} ${label.toLowerCase()}`)
        .join(", ");
      status.textContent = `${candidates.length} waiting (${counts}), from ${data.seen} feed entries.`;
      /* A feed that is down is worth saying out loud rather than looking like
         an empty shelf. */
      if (data.errors?.length) {
        status.className = "im-status is-bad";
        status.textContent += ` One feed did not answer: ${data.errors.join("; ")}`;
      }
      draw();
    } catch (err) {
      status.className = "im-status is-bad";
      status.textContent = err.message;
    } finally {
      refresh.disabled = false;
    }
  }

  function card(candidate) {
    const item = el("article", "im-card");
    const cover = el("img", "", {
      alt: "",
      loading: "lazy",
      src: `/api/cover?url=${encodeURIComponent(candidate.coverUrl)}`,
    });
    cover.style.aspectRatio = candidate.type === "book" ? "0.66" : "0.68";

    const body = el("div", "im-card-body");
    const meta = [candidate.creator, candidate.year].filter(Boolean).join(" · ");
    body.append(
      el("p", "im-source", { textContent: candidate.source === "goodreads" ? "Goodreads" : "Letterboxd" }),
      el("h3", "", { textContent: candidate.title }),
      el("p", "im-meta", { textContent: meta || TYPES[candidate.type] })
    );

    const marks = el("p", "im-marks");
    if (candidate.rating != null) marks.append(el("span", "im-chip is-rating", { textContent: stars(candidate.rating) }));
    if (candidate.finished) marks.append(el("span", "im-chip", { textContent: candidate.finished }));
    if (candidate.rewatch) marks.append(el("span", "im-chip", { textContent: "rewatch" }));
    if (marks.childElementCount) body.append(marks);

    /* Same chip vocabulary as the Add tab, and the same rule: an item with no
       genre cannot be filtered in the catalog, so it is not allowed in. */
    const genreWrap = el("div", "ad-genres");
    genreWrap.append(el("span", "ad-genres-label", { textContent: "Genres" }));
    const chosen = new Set();
    for (const genre of commonFor(candidate.type)) {
      const chip = el("button", "ad-genre", { type: "button", textContent: genre });
      chip.addEventListener("click", () => {
        if (chosen.has(genre)) chosen.delete(genre);
        else chosen.add(genre);
        chip.classList.toggle("is-on", chosen.has(genre));
      });
      genreWrap.append(chip);
    }
    const listId = `im-genres-${candidate.id}`;
    const datalist = el("datalist", "", { id: listId });
    for (const genre of allGenres) datalist.append(el("option", "", { value: genre }));
    const custom = el("input", "ad-genre-new", {
      placeholder: "or type one, comma separated",
      "aria-label": "Other genres",
    });
    custom.setAttribute("list", listId);
    genreWrap.append(custom, datalist);

    const line = el("p", "ad-card-status", { role: "status" });
    const accept = el("button", "", { type: "button", textContent: "Add to library" });
    const skip = el("button", "is-quiet", { type: "button", textContent: "Not this one" });

    accept.addEventListener("click", async () => {
      const genres = [...chosen];
      for (const extra of custom.value.split(",").map((g) => g.trim()).filter(Boolean)) genres.push(extra);
      if (!genres.length) {
        line.textContent = "Pick at least one genre first.";
        line.className = "ad-card-status is-bad";
        return;
      }
      accept.disabled = true;
      skip.disabled = true;
      line.className = "ad-card-status";
      line.textContent = "Sampling the cover";
      try {
        const paletteEntry = await samplePalette(candidate.coverUrl).catch(() => null);
        line.textContent = "Saving";
        const result = await catalogue.add({ candidate, genres, paletteEntry });
        line.className = "ad-card-status is-good";
        line.textContent = `Added${result.mode === "github" ? `, committed ${result.sha.slice(0, 7)}` : " locally"}`;
        settle(item, candidate);
      } catch (err) {
        line.textContent = err.message;
        line.className = "ad-card-status is-bad";
        accept.disabled = false;
        skip.disabled = false;
      }
    });

    skip.addEventListener("click", async () => {
      accept.disabled = true;
      skip.disabled = true;
      line.className = "ad-card-status";
      line.textContent = "Remembering that";
      try {
        await imports.skip(candidate.id);
        line.className = "ad-card-status";
        line.textContent = "Skipped. It will not be offered again.";
        settle(item, candidate);
      } catch (err) {
        line.textContent = err.message;
        line.className = "ad-card-status is-bad";
        accept.disabled = false;
        skip.disabled = false;
      }
    });

    const actions = el("div", "im-actions");
    actions.append(accept, skip);
    body.append(genreWrap, actions, line);
    item.append(cover, body);
    return item;
  }

  /* Dealt with, either way: the card greys out and drops out of the running
     count rather than vanishing, so it is obvious what just happened. */
  function settle(node, candidate) {
    node.classList.add("is-done");
    node.querySelector(".ad-genres")?.remove();
    node.querySelector(".im-actions")?.remove();
    candidates = candidates.filter((other) => other.id !== candidate.id);
  }

  await load();
}
