/* Rate and write. A list of every item on the left, the editor on the right.
   The preview uses the same renderMarkdown the build uses, imported straight
   from tools/lib, so what you see here is what the site will render. */

import { library } from "./api.js?v=admin1";
import { renderMarkdown } from "../../tools/lib/markdown.mjs";

const TYPES = { book: "Books", album: "Albums", film: "Films", other: "Podcasts" };

const el = (tag, className, props = {}) => Object.assign(document.createElement(tag), { className, ...props });

let items = [];
let current = null;
let dirty = false;

function warnOnLeave(event) {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
}

function itemRow(item, onPick) {
  const button = el("button", "aw-row", { type: "button" });
  button.dataset.id = item.id;
  const marks = el("span", "aw-row-marks");
  if (item.rating != null) marks.append(el("span", "aw-chip is-rating", { textContent: `${item.rating}` }));
  if (item.starred) marks.append(el("span", "aw-chip is-star", { textContent: "★" }));
  if (item.reviewHtml) marks.append(el("span", "aw-chip is-written", { textContent: "written" }));
  button.append(
    el("span", "aw-row-title", { textContent: item.title }),
    el("span", "aw-row-creator", { textContent: item.creator || "" }),
    marks
  );
  button.addEventListener("click", () => onPick(item));
  return button;
}

export async function mount(panel) {
  const data = await library.catalog();
  items = data.items;

  panel.replaceChildren();
  const layout = el("div", "aw-layout");

  /* ---- left: the picker ---- */
  const side = el("aside", "aw-side");
  const search = el("input", "", { type: "search", placeholder: "Search title or creator", "aria-label": "Search the catalog" });
  const filter = el("select", "", { "aria-label": "Filter by type" });
  filter.append(el("option", "", { value: "", textContent: "Everything" }));
  for (const [value, label] of Object.entries(TYPES)) filter.append(el("option", "", { value, textContent: label }));

  const onlyUnwritten = el("label", "aw-check");
  const onlyBox = el("input", "", { type: "checkbox" });
  onlyUnwritten.append(onlyBox, el("span", "", { textContent: "Needs a writeup" }));

  const list = el("div", "aw-list", { role: "list" });
  const summary = el("p", "aw-summary");
  side.append(search, filter, onlyUnwritten, summary, list);

  /* ---- right: the editor ---- */
  const editor = el("form", "aw-editor");
  editor.innerHTML = `
    <p class="admin-placeholder" data-empty>Pick something on the left.</p>
    <div class="aw-editor-inner" hidden data-inner>
      <header class="aw-editor-head">
        <img alt="" data-cover />
        <div>
          <p class="aw-editor-kicker" data-kicker></p>
          <h2 data-title></h2>
          <p class="aw-editor-creator" data-creator></p>
        </div>
      </header>
      <div class="aw-fields">
        <label>
          <span>Rating</span>
          <select data-rating>
            <option value="">Not rated</option>
            <option value="0.5">0.5</option><option value="1">1</option>
            <option value="1.5">1.5</option><option value="2">2</option>
            <option value="2.5">2.5</option><option value="3">3</option>
            <option value="3.5">3.5</option><option value="4">4</option>
            <option value="4.5">4.5</option><option value="5">5</option>
          </select>
        </label>
        <label>
          <span>Finished</span>
          <input data-finished placeholder="2026-03" inputmode="numeric" />
        </label>
        <label class="aw-check aw-check-inline">
          <input type="checkbox" data-starred />
          <span>Favorite</span>
        </label>
      </div>
      <label class="aw-review-label">
        <span>Writeup</span>
        <textarea data-review rows="12" placeholder="Markdown. Paragraphs, *emphasis*, **strong**, and [links](https://example.com)."></textarea>
      </label>
      <div class="aw-preview" aria-live="polite">
        <p class="aw-preview-label">Preview</p>
        <div data-preview></div>
      </div>
      <div class="aw-actions">
        <button type="submit" data-save>Save</button>
        <button type="button" class="is-quiet" data-revert>Revert</button>
        <p class="aw-status" data-status role="status"></p>
      </div>
    </div>`;

  layout.append(side, editor);
  panel.append(layout);

  const q = (sel) => editor.querySelector(sel);
  const fields = {
    rating: q("[data-rating]"), finished: q("[data-finished]"),
    starred: q("[data-starred]"), review: q("[data-review]"),
  };
  const status = q("[data-status]");

  function markDirty() {
    dirty = true;
    status.textContent = "Unsaved changes";
    status.className = "aw-status is-dirty";
  }

  function paint() {
    q("[data-preview]").innerHTML = renderMarkdown(fields.review.value) || '<p class="aw-preview-empty">Nothing yet.</p>';
  }

  for (const field of Object.values(fields)) {
    field.addEventListener("input", () => { markDirty(); paint(); });
    field.addEventListener("change", markDirty);
  }

  function renderList() {
    const term = search.value.trim().toLowerCase();
    const type = filter.value;
    const shown = items.filter((item) => {
      if (type && item.type !== type) return false;
      if (onlyBox.checked && item.reviewHtml) return false;
      if (!term) return true;
      return `${item.title} ${item.creator}`.toLowerCase().includes(term);
    });
    list.replaceChildren(...shown.map((item) => itemRow(item, pick)));
    const written = items.filter((i) => i.reviewHtml).length;
    const rated = items.filter((i) => i.rating != null).length;
    summary.textContent = `${shown.length} shown · ${written} written · ${rated} rated of ${items.length}`;
    if (current) list.querySelector(`[data-id="${current.id}"]`)?.classList.add("is-current");
  }

  async function pick(item) {
    if (dirty && !confirm(`Discard unsaved changes to ${current?.title}?`)) return;
    current = item;
    dirty = false;
    q("[data-empty]").hidden = true;
    q("[data-inner]").hidden = false;
    q("[data-cover]").src = item.cover;
    q("[data-kicker]").textContent = TYPES[item.type]?.replace(/s$/, "") || item.type;
    q("[data-title]").textContent = item.title;
    q("[data-creator]").textContent = [item.creator, item.year].filter(Boolean).join(" · ");
    fields.rating.value = item.rating == null ? "" : String(item.rating);
    fields.starred.checked = Boolean(item.starred);
    fields.finished.value = item.finished || "";
    status.textContent = "Loading the note";
    status.className = "aw-status";

    try {
      const { note } = await library.note(item.id);
      fields.review.value = bodyOf(note);
      status.textContent = note ? "Loaded" : "No note yet";
    } catch (err) {
      fields.review.value = "";
      status.textContent = `Could not load the note: ${err.message}`;
      status.className = "aw-status is-bad";
    }
    paint();
    renderList();
  }

  editor.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!current) return;
    const save = q("[data-save]");
    save.disabled = true;
    status.textContent = "Saving";
    status.className = "aw-status";
    try {
      const result = await library.save({
        id: current.id,
        rating: fields.rating.value,
        starred: fields.starred.checked,
        finished: fields.finished.value.trim() || null,
        review: fields.review.value,
      });
      dirty = false;
      items = items.map((item) => (item.id === result.item.id ? result.item : item));
      current = result.item;
      const where = result.mode === "github" ? `committed ${result.sha.slice(0, 7)}` : "written locally";
      status.textContent = [`Saved, ${where}`, ...result.warnings].join(" · ");
      status.className = "aw-status is-good";
      renderList();
    } catch (err) {
      status.textContent = err.message;
      status.className = "aw-status is-bad";
    } finally {
      save.disabled = false;
    }
  });

  q("[data-revert]").addEventListener("click", () => { if (current) pick(current); });
  search.addEventListener("input", renderList);
  filter.addEventListener("change", renderList);
  onlyBox.addEventListener("change", renderList);
  addEventListener("beforeunload", warnOnLeave);

  renderList();
  paint();
}

/* The editor edits prose, not frontmatter, so strip the fence back off. */
function bodyOf(note) {
  if (!note) return "";
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(note);
  return (match ? note.slice(match[0].length) : note).trim();
}
