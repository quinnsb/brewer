/* Add a new item. Search a catalogue, pick a result, give it genres, sample its
   colour in the browser, save. */

import { catalogue, library } from "./api.js?v=admin1";
import { samplePalette } from "./palette-browser.js?v=admin1";
import { SHAPE } from "../../tools/lib/identity.mjs";

const TYPES = { book: "Book", album: "Album", film: "Film", other: "Podcast" };
const el = (tag, className, props = {}) => Object.assign(document.createElement(tag), { className, ...props });

export async function mount(panel) {
  /* Genres are offered from what the library already uses, so the taxonomy
     stays a small vocabulary instead of growing a synonym for everything.
     Counted and grouped by type, because the genres that make sense for a
     record are not the ones that make sense for a novel. */
  const data = await library.catalog();
  const byType = {};
  for (const item of data.items) {
    const counts = (byType[item.type] ||= new Map());
    for (const genre of item.genres || []) counts.set(genre, (counts.get(genre) || 0) + 1);
  }
  const allGenres = [...new Set(data.items.flatMap((item) => item.genres || []))].sort();
  const commonFor = (type) =>
    [...(byType[type] || new Map())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([g]) => g);

  panel.replaceChildren();
  const wrap = el("div", "ad-wrap");

  const form = el("form", "ad-search");
  const type = el("select", "", { "aria-label": "What kind of thing" });
  for (const [value, label] of Object.entries(TYPES)) type.append(el("option", "", { value, textContent: label }));
  const query = el("input", "", { type: "search", placeholder: "Title, or title and creator", "aria-label": "Search" });
  const go = el("button", "", { type: "submit", textContent: "Search" });
  form.append(type, query, go);

  const status = el("p", "ad-status", { role: "status" });
  const results = el("div", "ad-results");
  wrap.append(form, status, results);
  panel.append(wrap);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!query.value.trim()) return;
    results.replaceChildren();
    status.className = "ad-status";
    status.textContent = "Searching";
    go.disabled = true;
    try {
      const { results: found } = await catalogue.search(type.value, query.value);
      status.textContent = found.length
        ? `${found.length} result${found.length === 1 ? "" : "s"}`
        : "Nothing found. Try a different wording.";
      results.replaceChildren(...found.map(card));
    } catch (err) {
      status.textContent = err.message;
      status.className = "ad-status is-bad";
    } finally {
      go.disabled = false;
    }
  });

  function card(candidate) {
    const item = el("article", `ad-card${candidate.already ? " is-already" : ""}`);
    const cover = el("img", "", { alt: "", loading: "lazy", src: `/api/cover?url=${encodeURIComponent(candidate.coverUrl)}` });
    /* A sleeve is square and a poster is not, and the same SHAPE table the
       shelf lays out from says so, so the preview crops the way the shelf will
       rather than cropping every cover to a book's proportions. */
    cover.style.aspectRatio = String(SHAPE[candidate.type]?.aspect ?? 0.66);
    const body = el("div", "ad-card-body");
    body.append(
      el("h3", "", { textContent: candidate.title }),
      el("p", "ad-card-meta", { textContent: [candidate.creator, candidate.year].filter(Boolean).join(" · ") })
    );

    if (candidate.already) {
      body.append(el("p", "ad-card-note", { textContent: "Already in the library" }));
      item.append(cover, body);
      return item;
    }

    /* Only the genres this type actually uses, and only the common ones as
       chips. Everything else is reachable by typing, with the full vocabulary
       behind a datalist so it still autocompletes. */
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

    const listId = `genres-${candidate.id}`;
    const datalist = el("datalist", "", { id: listId });
    for (const genre of allGenres) datalist.append(el("option", "", { value: genre }));
    const custom = el("input", "ad-genre-new", {
      placeholder: "or type one, comma separated",
      "aria-label": "Other genres",
    });
    custom.setAttribute("list", listId);
    genreWrap.append(custom, datalist);

    const save = el("button", "", { type: "button", textContent: "Add to library" });
    const line = el("p", "ad-card-status", { role: "status" });

    save.addEventListener("click", async () => {
      const genres = [...chosen];
      for (const extra of custom.value.split(",").map((g) => g.trim()).filter(Boolean)) genres.push(extra);
      if (!genres.length) {
        line.textContent = "Pick at least one genre first.";
        line.className = "ad-card-status is-bad";
        return;
      }
      save.disabled = true;
      line.className = "ad-card-status";
      line.textContent = "Sampling the cover";
      try {
        /* A cover that will not sample is not a reason to refuse the item; the
           next local build resamples everything anyway. */
        const paletteEntry = await samplePalette(candidate.coverUrl).catch(() => null);
        line.textContent = "Saving";
        const result = await catalogue.add({ candidate, genres, paletteEntry });
        line.className = "ad-card-status is-good";
        line.textContent = `Added${result.mode === "github" ? `, committed ${result.sha.slice(0, 7)}` : " locally"}`;
        item.classList.add("is-already");
        save.remove();
        genreWrap.remove();
      } catch (err) {
        line.textContent = err.message;
        line.className = "ad-card-status is-bad";
        save.disabled = false;
      }
    });

    body.append(genreWrap, save, line);
    item.append(cover, body);
    return item;
  }
}
