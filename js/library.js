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

async function main() {
  const { items } = await (await fetch(DATA_URL)).json();
  const root = document.getElementById("shelves");
  renderShelves(items, root);
}

main();
