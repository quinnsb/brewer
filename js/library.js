/* ============================================================
   LIBRARY — shelves and expand-in-place detail

   Four media types, four physics. They do not share one treatment because
   the objects do not: books stand as spines, records lean front-facing in a
   crate, posters sit in a rack, podcasts are flat art with no physical
   object to fake.
   ============================================================ */

import { spineWidth, spineHeight } from "./lib/geometry.js";

const DATA_URL = "data/library.json";

const TYPE_LABEL = {
  book: ["Books", "spine shelf"],
  album: ["Albums", "crate, front facing"],
  film: ["Films", "poster rack"],
  other: ["Podcasts", "tiles"],
};
const ORDER = ["book", "album", "film", "other"];

const el = (tag, cls, attrs) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function paint(node, item) {
  node.style.setProperty("--cover", item.palette?.cover || "#33302b");
  node.style.setProperty("--accent", item.palette?.accent || "#e8531c");
  node.style.setProperty("--ink", item.palette?.ink || "#f1ece3");
  node.setAttribute("aria-expanded", "false");
}

function coverImg(item) {
  const img = el("img");
  img.src = item.cover;
  img.alt = "";
  img.loading = "lazy";
  return img;
}

const label = (item) =>
  `${item.title}${item.creator ? `, ${item.creator}` : ""}${item.year ? `, ${item.year}` : ""}`;

const BUILDERS = {
  /* Generated spine: palette ground, vertical type, accent rules. The cover
     image is deliberately absent here; a 30px slice of a jacket is a smear,
     not a spine. The real cover shows in the expanded state. */
  book(item) {
    const btn = el("button", "spine", { type: "button", "aria-label": label(item) });
    paint(btn, item);
    btn.style.setProperty("--spine-w", `${spineWidth(item)}px`);
    btn.style.setProperty("--spine-h", `${spineHeight(item)}px`);
    const txt = el("span", "spine-txt");
    txt.append(
      Object.assign(el("span", "t"), { textContent: item.title }),
      Object.assign(el("span", "a"), { textContent: item.creator || "" })
    );
    btn.append(el("span", "spine-rule top"), txt, el("span", "spine-rule bot"));
    return btn;
  },
  album(item) {
    const btn = el("button", "sleeve", { type: "button", "aria-label": label(item) });
    paint(btn, item);
    btn.append(coverImg(item));
    return btn;
  },
  film(item) {
    const btn = el("button", "poster", { type: "button", "aria-label": label(item) });
    paint(btn, item);
    btn.append(coverImg(item));
    return btn;
  },
  other(item) {
    const btn = el("button", "tile", { type: "button", "aria-label": label(item) });
    paint(btn, item);
    btn.append(coverImg(item));
    return btn;
  },
};

const CONTAINER = {
  book() {
    const rail = el("div", "shelf-rail");
    const mount = el("div", "spine-shelf");
    rail.append(mount);
    return { rail, mount };
  },
  /* crate = scroll viewport > box (floor, lip, wall) > inner (the records) */
  album() {
    const rail = el("div", "crate");
    const box = el("div", "crate-box");
    const mount = el("div", "crate-inner");
    box.append(mount);
    rail.append(box);
    return { rail, mount };
  },
  film() {
    const rail = el("div", "shelf-rail");
    const mount = el("div", "rack");
    rail.append(mount);
    return { rail, mount };
  },
  other() {
    const rail = el("div");
    const mount = el("div", "tiles");
    rail.append(mount);
    return { rail, mount };
  },
};

export function renderShelves(items, root) {
  const byType = {};
  for (const it of items) (byType[it.type] ||= []).push(it);

  for (const type of ORDER) {
    const list = byType[type];
    if (!list?.length) continue;

    const block = el("section", "shelf-block");
    const [name, sub] = TYPE_LABEL[type];
    const lab = el("div", "shelf-label");
    lab.append(document.createTextNode(name), Object.assign(el("span"), { textContent: sub }));
    block.append(lab);

    const { rail, mount } = CONTAINER[type]();
    for (const item of list) {
      const node = BUILDERS[type](item);
      node.dataset.id = item.id;
      mount.append(node);
    }
    block.append(rail);
    root.append(block);
  }
}

/* ---------- expand in place ---------- */

let openId = null;

function detailNode(item) {
  const d = el("div", "detail");

  const fig = el("div");
  const img = el("img");
  img.src = item.cover;
  img.alt = "";
  fig.append(img);

  const body = el("div");
  body.append(Object.assign(el("h2"), { textContent: item.title }));

  const bits = [item.creator, item.year, item.finished ? `finished ${item.finished}` : null];
  body.append(
    Object.assign(el("p", "meta"), { textContent: bits.filter(Boolean).join("  ·  ") })
  );

  if (item.reviewHtml) {
    const r = el("div", "review");
    /* Built at build time from Quinn's own markdown, where the source text
       was escaped before any inline rule ran. */
    r.innerHTML = item.reviewHtml;
    body.append(r);
  } else {
    body.append(Object.assign(el("p", "empty"), { textContent: "No writeup yet." }));
  }

  if (item.sourceUrl) {
    const a = el("a", "src", { href: item.sourceUrl, target: "_blank", rel: "noopener" });
    a.textContent = "Source";
    body.append(a);
  }

  d.append(fig, body);
  return d;
}

function closeAll(root) {
  for (const n of root.querySelectorAll(".is-open")) {
    n.classList.remove("is-open");
    n.setAttribute("aria-expanded", "false");
  }
  for (const d of root.querySelectorAll(".detail")) d.remove();
  openId = null;
}

export function wireExpansion(items, root) {
  const byId = new Map(items.map((i) => [i.id, i]));

  root.addEventListener("click", (e) => {
    const node = e.target.closest("[data-id]");
    if (!node) return;
    const item = byId.get(node.dataset.id);
    if (!item) return;

    const wasOpen = openId === item.id;
    closeAll(root);
    if (wasOpen) return;

    node.classList.add("is-open");
    node.setAttribute("aria-expanded", "true");
    /* open width = the jacket at its true aspect ratio */
    if (item.type === "book") {
      node.style.setProperty("--open-w", `${Math.round(spineHeight(item) * item.aspect)}px`);
    }

    const d = detailNode(item);
    node.closest(".shelf-block").append(d);
    requestAnimationFrame(() => d.classList.add("is-in"));
    openId = item.id;
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openId) closeAll(root);
  });

  document.addEventListener("click", (e) => {
    if (openId && !e.target.closest(".shelf-block")) closeAll(root);
  });

  /* arrow keys walk a shelf */
  root.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const cur = e.target.closest("[data-id]");
    if (!cur) return;
    const sibs = [...cur.parentElement.querySelectorAll("[data-id]")];
    const next = sibs[sibs.indexOf(cur) + (e.key === "ArrowRight" ? 1 : -1)];
    if (next) {
      next.focus();
      e.preventDefault();
    }
  });
}

/* Used by the hero: jump to an item's shelf and open it. */
export function openItem(id) {
  const node = document.querySelector(`#shelves [data-id="${CSS.escape(id)}"]`);
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  node.click();
}

async function main() {
  const { items } = await (await fetch(DATA_URL)).json();
  const root = document.getElementById("shelves");
  renderShelves(items, root);
  wireExpansion(items, root);

  /* Deferred so this module finishes evaluating first: library-hero.js
     imports openItem back from here. */
  const { initHero } = await import("./library-hero.js");
  initHero(items);
}

main();
