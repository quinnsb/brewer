/* Build the curated lists. Every list on the left, the one you picked on the
   right: its words, its members in order, and a search to add more.

   Nothing is held locally. Each change is one operation posted to /api/lists,
   which answers with the whole set after it, and the panel re-renders from that
   answer. It costs a round trip per click and it means what is on screen is
   always what is in the repo. */

import { lists as listsApi, library } from "./api.js?v=admin1";

const TYPES = { book: "Book", album: "Album", film: "Film", other: "Podcast" };
const NOUN = { book: "books", album: "albums", film: "films", other: "podcasts" };
const el = (tag, className, props = {}) => Object.assign(document.createElement(tag), { className, ...props });

let items = [];
let lists = [];
let currentId = null;

export async function mount(panel) {
  const [catalog, loaded] = await Promise.all([library.catalog(), listsApi.all()]);
  items = catalog.items;
  lists = loaded.lists;

  panel.replaceChildren();
  const layout = el("div", "al-layout");

  /* ---- left: every list, plus the one control that makes a new one ---- */
  const side = el("aside", "al-side");
  const index = el("div", "al-index");

  const maker = el("form", "al-maker");
  const makerType = el("select", "", { "aria-label": "Kind of list" });
  for (const [value, label] of Object.entries(TYPES)) makerType.append(el("option", "", { value, textContent: label }));
  const makerTitle = el("input", "", { placeholder: "New list title", "aria-label": "New list title" });
  const makerGo = el("button", "", { type: "submit", textContent: "Create" });
  maker.append(makerType, makerTitle, makerGo);
  side.append(maker, index);

  /* ---- right: the editor ---- */
  const editor = el("section", "al-editor");
  layout.append(side, editor);
  panel.append(layout);

  const status = el("p", "al-status", { role: "status" });
  panel.append(status);

  function say(message, kind = "") {
    status.textContent = message;
    status.className = `al-status${kind ? ` is-${kind}` : ""}`;
  }

  /* One place where a change is sent, so every caller gets the same error
     handling and the same re-render. */
  async function apply(op, working) {
    say(working);
    try {
      const result = await listsApi.apply(op);
      lists = result.lists;
      say(result.mode === "github" ? `Saved, committed ${result.sha.slice(0, 7)}` : "Saved locally", "good");
      return true;
    } catch (err) {
      say(err.message, "bad");
      return false;
    }
  }

  function renderIndex() {
    index.replaceChildren();
    for (const type of Object.keys(TYPES)) {
      const group = lists.filter((list) => list.type === type);
      if (!group.length) continue;
      index.append(el("p", "al-group", { textContent: TYPES[type] }));
      for (const list of group) {
        const row = el("button", `al-row${list.id === currentId ? " is-on" : ""}`, { type: "button" });
        row.append(
          el("span", "al-row-title", { textContent: list.title }),
          el("span", "al-row-count", {
            textContent: list.items.length ? `${list.items.length}${list.ranked ? " ranked" : ""}` : "draft",
          })
        );
        row.addEventListener("click", () => {
          currentId = list.id;
          renderAll();
        });
        index.append(row);
      }
    }
  }

  function renderEditor() {
    const list = lists.find((candidate) => candidate.id === currentId);
    editor.replaceChildren();
    if (!list) {
      editor.append(el("p", "admin-placeholder", { textContent: "Pick a list on the left, or make one." }));
      return;
    }

    const byId = new Map(items.map((item) => [item.id, item]));
    const members = list.items.map((id) => byId.get(id)).filter(Boolean);
    /* An id with no item behind it means the item left the library. Saying so
       is better than silently rendering a shorter list than the file holds. */
    const orphans = list.items.filter((id) => !byId.has(id));

    /* ---- the words ---- */
    const head = el("div", "al-head");
    const title = el("input", "al-title-input", { value: list.title, "aria-label": "List title" });
    const intro = el("textarea", "al-intro", {
      value: list.intro || "",
      rows: 3,
      placeholder: "A line or two about the list. Shown under the title on the site.",
      "aria-label": "List intro",
    });
    const ranked = el("label", "al-check");
    const rankedBox = el("input", "", { type: "checkbox", checked: Boolean(list.ranked) });
    ranked.append(rankedBox, el("span", "", { textContent: "Ranked, so the order is the point" }));

    const save = el("button", "", { type: "button", textContent: "Save the words" });
    save.addEventListener("click", async () => {
      save.disabled = true;
      await apply({ op: "update", id: list.id, title: title.value, intro: intro.value, ranked: rankedBox.checked }, "Saving");
      save.disabled = false;
      renderAll();
    });

    const remove = el("button", "is-quiet", { type: "button", textContent: "Delete this list" });
    remove.addEventListener("click", async () => {
      if (!confirm(`Delete "${list.title}"? The ${NOUN[list.type]} on it stay in the library.`)) return;
      remove.disabled = true;
      if (await apply({ op: "delete", id: list.id }, "Deleting")) currentId = null;
      remove.disabled = false;
      renderAll();
    });

    const url = el("a", "al-view", {
      href: `library-lists.html?list=${encodeURIComponent(list.id)}`,
      target: "_blank",
      rel: "noopener",
      textContent: "View on the site",
    });

    head.append(
      el("p", "al-kicker", { textContent: `${TYPES[list.type]} list · ${list.id}` }),
      title, intro, ranked,
      el("div", "al-head-actions", {}),
    );
    head.lastChild.append(save, remove, url);
    editor.append(head);

    /* ---- the members, in order ---- */
    editor.append(el("p", "al-section", {
      textContent: members.length ? `${members.length} ${NOUN[list.type]}, in order` : `No ${NOUN[list.type]} on it yet`,
    }));

    const rows = el("div", "al-members");
    members.forEach((item, position) => {
      const row = el("div", "al-member");
      if (list.ranked) row.append(el("span", "al-rank", { textContent: String(position + 1).padStart(2, "0") }));
      row.append(el("img", "", { src: `/${item.cover}`, alt: "", loading: "lazy" }));
      row.append(el("span", "al-member-title", { textContent: item.title }));
      row.append(el("span", "al-member-creator", { textContent: item.creator || "" }));

      /* Up and down rather than drag and drop: buttons are keyboard reachable
         for nothing, and drag and drop is not. */
      const up = el("button", "al-nudge", { type: "button", textContent: "↑", title: "Move up" });
      const down = el("button", "al-nudge", { type: "button", textContent: "↓", title: "Move down" });
      up.disabled = position === 0;
      down.disabled = position === members.length - 1;
      up.setAttribute("aria-label", `Move ${item.title} up`);
      down.setAttribute("aria-label", `Move ${item.title} down`);
      up.addEventListener("click", async () => {
        await apply({ op: "move", id: list.id, itemId: item.id, direction: -1 }, "Moving");
        renderAll();
      });
      down.addEventListener("click", async () => {
        await apply({ op: "move", id: list.id, itemId: item.id, direction: 1 }, "Moving");
        renderAll();
      });

      const drop = el("button", "al-drop", { type: "button", textContent: "Remove" });
      drop.setAttribute("aria-label", `Remove ${item.title} from this list`);
      drop.addEventListener("click", async () => {
        await apply({ op: "remove", id: list.id, itemId: item.id }, "Removing");
        renderAll();
      });

      row.append(up, down, drop);
      rows.append(row);
    });

    for (const id of orphans) {
      const row = el("div", "al-member is-orphan");
      row.append(el("span", "al-member-title", { textContent: `${id} is no longer in the library` }));
      const drop = el("button", "al-drop", { type: "button", textContent: "Remove" });
      drop.addEventListener("click", async () => {
        await apply({ op: "remove", id: list.id, itemId: id }, "Removing");
        renderAll();
      });
      row.append(drop);
      rows.append(row);
    }
    editor.append(rows);

    /* ---- adding, from the catalog rather than the internet ---- */
    editor.append(el("p", "al-section", { textContent: `Add ${NOUN[list.type]}` }));
    const finder = el("div", "al-finder");
    const query = el("input", "", {
      type: "search",
      placeholder: `Search the ${NOUN[list.type]} already in the library`,
      "aria-label": "Search the catalog",
    });
    const found = el("div", "al-found");
    finder.append(query, found);
    editor.append(finder);

    /* The catalog, not a catalogue search: a list can only hold things that are
       already in the library, and the Add tab is where new things arrive. */
    const pool = items.filter((item) => item.type === list.type && !list.items.includes(item.id));
    const renderFound = () => {
      const term = query.value.trim().toLowerCase();
      const matches = (term
        ? pool.filter((item) =>
            item.title.toLowerCase().includes(term) || (item.creator || "").toLowerCase().includes(term))
        : pool
      ).slice(0, 12);

      found.replaceChildren(...matches.map((item) => {
        const add = el("button", "al-add", { type: "button" });
        add.append(
          el("img", "", { src: `/${item.cover}`, alt: "", loading: "lazy" }),
          el("span", "al-add-title", { textContent: item.title }),
          el("span", "al-add-creator", { textContent: item.creator || "" })
        );
        add.addEventListener("click", async () => {
          add.disabled = true;
          await apply({ op: "add", id: list.id, itemId: item.id }, `Adding ${item.title}`);
          renderAll();
        });
        return add;
      }));
      if (!matches.length) found.append(el("p", "al-none", { textContent: "Nothing left to add that matches." }));
    };
    query.addEventListener("input", renderFound);
    renderFound();
  }

  function renderAll() {
    renderIndex();
    renderEditor();
  }

  maker.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!makerTitle.value.trim()) return;
    makerGo.disabled = true;
    const before = new Set(lists.map((list) => list.id));
    if (await apply({ op: "create", type: makerType.value, title: makerTitle.value }, "Creating")) {
      currentId = lists.find((list) => !before.has(list.id))?.id ?? currentId;
      makerTitle.value = "";
    }
    makerGo.disabled = false;
    renderAll();
  });

  renderAll();
}
