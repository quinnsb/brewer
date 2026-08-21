/* ============================================================
   LIBRARY — shelves and expand-in-place detail

   Four media types, four physics. They do not share one treatment because
   the objects do not: books stand as spines, records move through a
   coverflow, posters sit in a rack, and podcasts are flat art.
   ============================================================ */

import { spineWidth, spineHeight } from "./lib/geometry.js";

const DATA_URL = "data/library.json?v=feedback5";

const TYPE_LABEL = {
  book: ["Books", "spine shelf"],
  album: ["Albums", "drag, scroll, or use arrow keys"],
  film: ["Films", "poster rack"],
  other: ["Podcasts", "tiles"],
};
const ORDER = ["book", "album", "film", "other"];
const LIST_LINK = {
  book: ["See all book lists", "books"],
  album: ["See all album lists", "albums"],
  film: ["See all film lists", "films"],
  other: ["See all podcast lists", "podcasts"],
};

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

function coverImg(item, cls = "") {
  const img = el("img", cls);
  img.src = item.cover;
  img.alt = "";
  img.loading = "lazy";
  img.draggable = false;
  return img;
}

const label = (item) =>
  `${item.title}${item.creator ? `, ${item.creator}` : ""}${item.year ? `, ${item.year}` : ""}`;

const visualVariant = (id, count) => {
  let value = 0;
  for (const char of id) value = (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0;
  return value % count;
};

const BUILDERS = {
  /* Generated spine at rest, real jacket when the book opens. */
  book(item) {
    const btn = el("button", "spine", { type: "button", "aria-label": label(item) });
    paint(btn, item);
    btn.dataset.spineStyle = String(visualVariant(item.id, 5));
    btn.style.setProperty("--spine-w", `${spineWidth(item)}px`);
    btn.style.setProperty("--spine-h", `${spineHeight(item)}px`);
    const txt = el("span", "spine-txt");
    txt.append(
      Object.assign(el("span", "t"), { textContent: item.title }),
      Object.assign(el("span", "a"), { textContent: item.creator || "" })
    );
    btn.append(
      coverImg(item, "spine-cover"),
      el("span", "spine-band"),
      el("span", "spine-rule top"),
      txt,
      el("span", "spine-rule bot"),
      el("span", "spine-mark")
    );
    return btn;
  },
  album(item) {
    const btn = el("button", "coverflow-slide", {
      type: "button",
      "aria-label": label(item),
      "aria-roledescription": "slide",
    });
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
  album() {
    const rail = el("div", "coverflow", {
      role: "region",
      "aria-roledescription": "carousel",
      "aria-label": "Album covers",
    });
    const mount = el("div", "coverflow-stage");
    const status = el("p", "sr-only", { "aria-live": "polite" });
    rail.append(mount, status);
    return { rail, mount, status };
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
    const lab = el("h2", "shelf-label", { id: `shelf-${type}-heading` });
    block.setAttribute("aria-labelledby", lab.id);
    lab.append(document.createTextNode(name), Object.assign(el("span"), { textContent: sub }));
    block.append(lab);

    const { rail, mount, status } = CONTAINER[type]();
    for (const item of list) {
      const node = BUILDERS[type](item);
      node.dataset.id = item.id;
      mount.append(node);
    }
    const [linkText, anchor] = LIST_LINK[type];
    const actions = el("div", "shelf-actions");
    const listLink = el("a", "shelf-lists-link", { href: `library-lists.html#${anchor}` });
    listLink.textContent = linkText;
    actions.append(listLink);
    block.append(rail, actions);
    root.append(block);
    if (type === "album") wireCoverflow(list, rail, mount, status, root);
  }
}

/* ---------- albums: native coverflow ---------- */

const REDUCED =
  matchMedia("(prefers-reduced-motion: reduce)").matches ||
  new URLSearchParams(location.search).get("motion") === "reduce";
if (REDUCED) document.documentElement.classList.add("reduce-motion");
const coverflowById = new Map();

function wireCoverflow(items, frame, stage, status, root) {
  const nodes = [...stage.querySelectorAll(".coverflow-slide")];
  const count = nodes.length;
  const gap = 0.05;
  let width = 0;
  let pos = 0;
  let target = 0;
  let selected = -1;
  let raf = 0;
  let drag = null;
  let suppressClick = false;
  let wheelTimer = 0;

  const indexAt = (value) => ((Math.round(value) % count) + count) % count;
  const clamp = (value) => value;

  function foldedOffset(index, value = pos) {
    let offset = index - value;
    offset = ((offset % count) + count) % count;
    if (offset > count / 2) offset -= count;
    return offset;
  }

  function announce(index) {
    if (index === selected) return;
    const hadSlideFocus = document.activeElement?.classList.contains("coverflow-slide");
    selected = index;
    const item = items[index];
    status.textContent = `${item.title}, ${item.creator || "Unknown"}, ${index + 1} of ${count}`;
    nodes.forEach((node, i) => {
      node.setAttribute("aria-current", String(i === index));
      node.tabIndex = i === index ? 0 : -1;
    });
    if (hadSlideFocus) nodes[index].focus({ preventScroll: true });
    if (openId && openId !== item.id) closeAll(root);
  }

  function paint() {
    if (!width) return;
    const pitch = width * (1 + gap);
    for (let index = 0; index < count; index++) {
      const node = nodes[index];
      const offset = foldedOffset(index);
      const distance = Math.abs(offset);
      const ramp = distance ** 0.56;
      const tilt = Math.min(44 * ramp, 82) * Math.sign(offset);
      const edge = Math.min(1, Math.max(0, count / 2 - distance));
      node.style.transform =
        `translateX(calc(-50% + ${offset * pitch}px)) ` +
        `translateZ(${-0.6 * width * ramp}px) rotateY(${-tilt}deg)`;
      node.style.opacity = String(Math.max(0, 1 - 0.1 * distance) * edge);
      node.style.zIndex = String(100 - Math.round(distance));
    }
    announce(indexAt(pos));
  }

  function settle(next, done) {
    if (raf) cancelAnimationFrame(raf);
    target = clamp(next);
    announce(indexAt(target));
    if (REDUCED) {
      pos = target;
      paint();
      done?.();
      return;
    }
    const step = () => {
      const remaining = target - pos;
      if (Math.abs(remaining) < 0.0004) {
        pos = target;
        paint();
        raf = 0;
        done?.();
        return;
      }
      pos += remaining * 0.16;
      paint();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function goTo(index, done) {
    const next = index + Math.round((target - index) / count) * count;
    settle(next, done);
  }

  function nudge(by) {
    settle(Math.round(target) + by);
  }

  nodes.forEach((node, index) => {
    node.setAttribute("aria-label", `${label(items[index])}, ${index + 1} of ${count}`);
    node.addEventListener("click", (event) => {
      if (suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (Math.abs(foldedOffset(index)) > 0.12) {
        event.preventDefault();
        event.stopPropagation();
        goTo(index);
      } else {
        event.preventDefault();
        event.stopPropagation();
        toggleExpansion(items[index], node, root);
      }
    });
    coverflowById.set(items[index].id, {
      open: () => goTo(index, () => toggleExpansion(items[index], node, root)),
    });
  });

  frame.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudge(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nudge(1);
    }
  });

  frame.addEventListener("pointerdown", (event) => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    target = pos;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      pos,
      velocity: 0,
      time: performance.now(),
      moved: false,
    };
  });

  frame.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId || !width) return;
    const now = performance.now();
    const previous = pos;
    pos = clamp(drag.pos - (event.clientX - drag.x) / (width * (1 + gap)));
    drag.velocity = ((pos - previous) / Math.max(now - drag.time, 1)) * 1000;
    drag.time = now;
    drag.moved ||= Math.abs(event.clientX - drag.x) > 4;
    if (drag.moved && !frame.hasPointerCapture(event.pointerId)) {
      frame.setPointerCapture(event.pointerId);
    }
    target = pos;
    paint();
  });

  const endDrag = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const moved = drag.moved;
    const carried = Math.max(-2, Math.min(2, drag.velocity * 0.18));
    drag = null;
    if (moved) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
    }
    settle(Math.round(pos + carried));
  };
  frame.addEventListener("pointerup", endDrag);
  frame.addEventListener("pointercancel", endDrag);

  frame.addEventListener("wheel", (event) => {
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (!horizontal && !event.shiftKey) return;
    event.preventDefault();
    if (!width) return;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    const delta = horizontal ? event.deltaX : event.deltaY;
    pos = clamp(pos + delta / (width * (1 + gap)));
    target = pos;
    paint();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => settle(Math.round(pos)), 90);
  }, { passive: false });

  const measure = () => {
    width = nodes[0]?.offsetWidth || 0;
    paint();
  };
  measure();
  new ResizeObserver(measure).observe(frame);
}

/* Ratings are authored with the rest of Quinn's content. The public page is
   deliberately display-only, so a visitor cannot create a rating that looks
   like Quinn's opinion. */
function ratingDisplay(item) {
  const value = Number(item.rating);
  if (!Number.isFinite(value) || value <= 0) return null;
  const rating = Math.min(5, Math.max(0, value));
  const wrap = el("div", "rating");
  const heading = el("div", "rating-heading");
  heading.append(
    Object.assign(el("span"), { textContent: "Quinn's rating" }),
    Object.assign(el("span", "rating-value"), { textContent: `${rating} of 5` })
  );
  const stars = el("div", "rating-stars-readonly", {
    role: "img",
    "aria-label": `Quinn rated ${item.title} ${rating} out of 5`,
  });
  const base = Object.assign(el("span", "", { "aria-hidden": "true" }), { textContent: "★★★★★" });
  const fill = Object.assign(el("span", "rating-stars-fill", { "aria-hidden": "true" }), { textContent: "★★★★★" });
  fill.style.width = `${rating * 20}%`;
  stars.append(base, fill);
  wrap.append(heading, stars);
  return wrap;
}

function factsNode(item) {
  if (!item.facts?.length) return null;
  const list = el("dl", "media-facts");
  for (const [term, value] of item.facts) {
    if (value === null || value === undefined || value === "") continue;
    const row = el("div");
    row.append(
      Object.assign(el("dt"), { textContent: term }),
      Object.assign(el("dd"), { textContent: String(value) })
    );
    list.append(row);
  }
  return list.childElementCount ? list : null;
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

  const facts = factsNode(item);
  if (facts) body.append(facts);
  const rating = ratingDisplay(item);
  if (rating) body.append(rating);

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

function toggleExpansion(item, node, root) {
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
}

export function wireExpansion(items, root) {
  const byId = new Map(items.map((i) => [i.id, i]));

  root.addEventListener("click", (e) => {
    const node = e.target.closest("[data-id]");
    if (!node) return;
    const item = byId.get(node.dataset.id);
    if (!item) return;
    toggleExpansion(item, node, root);
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
    if (!cur || cur.closest(".coverflow")) return;
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
  node.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center", inline: "center" });
  const coverflow = coverflowById.get(id);
  if (coverflow) coverflow.open();
  else node.click();
}

async function main() {
  const { items } = await (await fetch(DATA_URL)).json();
  const root = document.getElementById("shelves");
  renderShelves(items, root);
  wireExpansion(items, root);

  /* Deferred so this module finishes evaluating first: library-hero.js
     imports openItem back from here. */
  const { initHero } = await import("./library-hero.js?v=hero-albums2");
  initHero(items);
}

main();
