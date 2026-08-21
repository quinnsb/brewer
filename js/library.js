/* ============================================================
   LIBRARY — shelves and immersive media detail

   Four media types, four physics. They do not share one treatment because
   the objects do not: books overlap as jackets, records move through a
   coverflow, posters sit in a rack, and podcasts are flat art.
   ============================================================ */

import { spineHeight as coverHeight } from "./lib/geometry.js?v=hero-orbit2";

const DATA_URL = "data/library.json?v=unique-albums1";

const TYPE_LABEL = {
  book: ["Books", "drag or scroll either direction"],
  album: ["Albums", "drag, scroll, or use arrow keys"],
  film: ["Films", "poster rack"],
  other: ["Podcasts", "tiles"],
};
const ORDER = ["book", "album", "film", "other"];
const LIST_LINK = {
  book: ["See all book lists", "book"],
  album: ["See all album lists", "album"],
  film: ["See all film lists", "film"],
  other: ["See all podcast lists", "other"],
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
  /* Front-facing jackets overlap like a loose run of books on a table. */
  book(item) {
    const btn = el("button", "book-cover", { type: "button", "aria-label": label(item) });
    paint(btn, item);
    const height = coverHeight(item);
    btn.style.setProperty("--book-h", `${height}px`);
    btn.style.setProperty("--book-w", `${Math.round(height * item.aspect)}px`);
    btn.style.setProperty("--book-tilt", `${visualVariant(item.id, 7) - 3}deg`);
    btn.append(coverImg(item));
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
    const rail = el("div", "shelf-rail book-loop", {
      role: "region",
      "aria-label": "Book covers",
    });
    const mount = el("div", "book-cover-shelf");
    const run = el("div", "book-cover-run");
    mount.append(run);
    rail.append(mount);
    return { rail, mount: run };
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
    const listLink = el("a", "shelf-lists-link", { href: `library-lists.html?type=${anchor}` });
    listLink.textContent = linkText;
    actions.append(listLink);
    block.append(rail, actions);
    root.append(block);
    if (type === "book") wireBookLoop(rail, mount);
    else if (type === "album") wireCoverflow(list, rail, mount, status);
  }
}

/* ---------- books: seamless looping rail ---------- */

function wireBookLoop(frame, originalRun) {
  const shelf = originalRun.parentElement;
  const before = originalRun.cloneNode(true);
  const after = originalRun.cloneNode(true);
  let runWidth = 0;
  let initialized = false;
  let drag = null;
  let suppressClick = false;

  for (const clone of [before, after]) {
    clone.dataset.loopClone = "true";
    clone.setAttribute("aria-hidden", "true");
    for (const button of clone.querySelectorAll("button")) button.tabIndex = -1;
  }
  shelf.prepend(before);
  shelf.append(after);

  const normalize = () => {
    if (!runWidth) return;
    const x = frame.scrollLeft;
    if (x < runWidth * 0.5) frame.scrollLeft = x + runWidth;
    else if (x >= runWidth * 1.5) frame.scrollLeft = x - runWidth;
  };

  const measure = () => {
    const firstCoverWidth = originalRun.querySelector(".book-cover")?.getBoundingClientRect().width || 0;
    const runStyle = getComputedStyle(originalRun);
    const boundaryPadding = parseFloat(runStyle.paddingLeft) + parseFloat(runStyle.paddingRight);
    shelf.style.setProperty(
      "--book-run-overlap",
      `${(-(firstCoverWidth * 0.22 + boundaryPadding)).toFixed(2)}px`
    );
    runWidth = originalRun.offsetLeft - before.offsetLeft;
    if (!runWidth) return;
    if (!initialized) {
      frame.scrollLeft = runWidth;
      initialized = true;
    } else {
      normalize();
    }
  };

  frame.addEventListener("scroll", normalize, { passive: true });
  new ResizeObserver(measure).observe(originalRun);
  requestAnimationFrame(measure);

  frame.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, startX: event.clientX, moved: false };
  });

  frame.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const delta = event.clientX - drag.x;
    drag.x = event.clientX;
    drag.moved ||= Math.abs(event.clientX - drag.startX) > 4;
    if (!drag.moved) return;
    if (!frame.hasPointerCapture(event.pointerId)) frame.setPointerCapture(event.pointerId);
    frame.scrollLeft -= delta;
    normalize();
  });

  const endDrag = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const moved = drag.moved;
    drag = null;
    if (moved) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
    }
  };
  frame.addEventListener("pointerup", endDrag);
  frame.addEventListener("pointercancel", endDrag);

  frame.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  frame.addEventListener("wheel", (event) => {
    if (!event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    frame.scrollLeft += event.deltaY;
    normalize();
  }, { passive: false });
}

/* ---------- albums: native coverflow ---------- */

const REDUCED =
  matchMedia("(prefers-reduced-motion: reduce)").matches ||
  new URLSearchParams(location.search).get("motion") === "reduce";
if (REDUCED) document.documentElement.classList.add("reduce-motion");
const coverflowById = new Map();

function wireCoverflow(items, frame, stage, status) {
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
        openDetail(items[index], node);
      }
    });
    coverflowById.set(items[index].id, {
      open: () => goTo(index, () => openDetail(items[index], node)),
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

/* ---------- immersive media detail ---------- */

const DETAIL_TYPE = { book: "Book", album: "Album", film: "Film", other: "Podcast" };
let openId = null;
let detailLayer = null;
let detailItems = [];
let detailRoot = null;
let detailSource = null;
let detailCloseTimer = 0;
let detailSwitchTimer = 0;
const inertBeforeDetail = new Map();

function svgIcon(path) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS(ns, "path");
  line.setAttribute("d", path);
  line.setAttribute("stroke", "currentColor");
  line.setAttribute("stroke-width", "1.8");
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke-linejoin", "round");
  svg.append(line);
  return svg;
}

function sourceNodeFor(id) {
  const matches = [...document.querySelectorAll(`#shelves [data-id="${CSS.escape(id)}"]`)];
  return matches.find((node) => !node.closest("[data-loop-clone]")) || matches[0] || null;
}

function markExpanded(node) {
  if (!detailRoot) return;
  for (const current of detailRoot.querySelectorAll(".is-open")) {
    current.classList.remove("is-open");
    current.setAttribute("aria-expanded", "false");
  }
  if (node) {
    node.classList.add("is-open");
    node.setAttribute("aria-expanded", "true");
  }
}

function setPageInert(active) {
  if (active) {
    inertBeforeDetail.clear();
    for (const child of document.body.children) {
      if (child === detailLayer || child.tagName === "SCRIPT") continue;
      inertBeforeDetail.set(child, child.inert);
      child.inert = true;
    }
    return;
  }
  for (const [child, wasInert] of inertBeforeDetail) child.inert = wasInert;
  inertBeforeDetail.clear();
}

function detailSequence(item) {
  const items = detailItems.filter((candidate) => candidate.type === item.type);
  const index = Math.max(0, items.findIndex((candidate) => candidate.id === item.id));
  return {
    index,
    count: items.length,
    previous: items[(index - 1 + items.length) % items.length],
    next: items[(index + 1) % items.length],
  };
}

function navButton(direction, item) {
  const button = el("button", `media-detail-nav-button is-${direction}`, {
    type: "button",
    "aria-label": `${direction === "previous" ? "Previous" : "Next"} ${DETAIL_TYPE[item.type].toLowerCase()}: ${item.title}`,
  });
  const arrow = svgIcon(direction === "previous" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6");
  const copy = el("span");
  copy.append(
    Object.assign(el("small"), { textContent: direction === "previous" ? "Previous" : "Next" }),
    Object.assign(el("strong"), { textContent: item.title })
  );
  if (direction === "previous") button.append(arrow, copy);
  else button.append(copy, arrow);
  button.addEventListener("click", () => openDetail(item, sourceNodeFor(item.id), { replace: true }));
  return button;
}

function detailNode(item) {
  const sequence = detailSequence(item);
  const titleId = `media-detail-title-${item.id}`;
  const layer = el("section", `media-detail-layer is-${item.type}`, {
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": titleId,
  });
  layer.style.setProperty("--detail-accent", item.palette?.accent || "#f3c844");

  const art = el("div", "media-detail-art");
  const morph = el("div", "media-detail-morph");
  const object = el("figure", `media-detail-object is-${item.type}`);
  const image = el("img");
  image.src = item.cover;
  image.alt = `${item.title} cover`;
  image.draggable = false;
  object.append(image);
  morph.append(object);
  art.append(morph);

  const copy = el("article", "media-detail-copy");
  const close = el("button", "media-detail-close", {
    type: "button",
    "aria-label": `Close ${item.title} details`,
  });
  close.append(svgIcon("M6 6l12 12M18 6L6 18"));
  close.addEventListener("click", () => closeDetail());

  const header = el("header", "media-detail-header");
  header.append(
    Object.assign(el("p", "media-detail-kicker"), {
      textContent: `${DETAIL_TYPE[item.type]} ${String(sequence.index + 1).padStart(2, "0")} of ${String(sequence.count).padStart(2, "0")}`,
    }),
    Object.assign(el("h2"), { id: titleId, textContent: item.title })
  );
  const bits = [item.creator, item.year, item.finished ? `finished ${item.finished}` : null];
  header.append(
    Object.assign(el("p", "media-detail-meta"), { textContent: bits.filter(Boolean).join("  ·  ") })
  );
  copy.append(close, header);

  if (item.reviewHtml) {
    const review = el("div", "media-detail-review");
    /* Built at build time from Quinn's own markdown, where the source text
       was escaped before any inline rule ran. */
    review.innerHTML = item.reviewHtml;
    copy.append(review);
  } else {
    copy.append(Object.assign(el("p", "media-detail-empty"), { textContent: "No writeup yet." }));
  }

  const facts = factsNode(item);
  if (facts) copy.append(facts);
  const rating = ratingDisplay(item);
  if (rating) copy.append(rating);

  if (item.sourceUrl) {
    const source = el("a", "media-detail-source", {
      href: item.sourceUrl,
      target: "_blank",
      rel: "noopener",
    });
    source.textContent = "View source";
    copy.append(source);
  }

  const navigation = el("nav", "media-detail-navigation", {
    "aria-label": `${DETAIL_TYPE[item.type]} detail navigation`,
  });
  navigation.append(navButton("previous", sequence.previous), navButton("next", sequence.next));
  copy.append(navigation);
  layer.append(art, copy);
  return layer;
}

function setMorphOrigin(layer, source) {
  const morph = layer.querySelector(".media-detail-morph");
  const target = morph.getBoundingClientRect();
  const sourceRect = source?.getBoundingClientRect();
  const visible = sourceRect && sourceRect.width && sourceRect.height &&
    sourceRect.right > 0 && sourceRect.left < innerWidth && sourceRect.bottom > 0 && sourceRect.top < innerHeight;
  if (!visible || REDUCED) {
    morph.style.setProperty("--detail-dx", "0px");
    morph.style.setProperty("--detail-dy", "18px");
    morph.style.setProperty("--detail-sx", "0.96");
    morph.style.setProperty("--detail-sy", "0.96");
    return;
  }
  const sourceX = sourceRect.left + sourceRect.width / 2;
  const sourceY = sourceRect.top + sourceRect.height / 2;
  const targetX = target.left + target.width / 2;
  const targetY = target.top + target.height / 2;
  morph.style.setProperty("--detail-dx", `${sourceX - targetX}px`);
  morph.style.setProperty("--detail-dy", `${sourceY - targetY}px`);
  morph.style.setProperty("--detail-sx", String(sourceRect.width / target.width));
  morph.style.setProperty("--detail-sy", String(sourceRect.height / target.height));
}

function finishDetailClose(restoreFocus = true) {
  clearTimeout(detailCloseTimer);
  clearTimeout(detailSwitchTimer);
  detailLayer?.remove();
  detailLayer = null;
  document.body.classList.remove("media-detail-open");
  setPageInert(false);
  markExpanded(null);
  openId = null;
  if (restoreFocus && detailSource?.isConnected) detailSource.focus({ preventScroll: true });
  detailSource = null;
}

function closeDetail({ restoreFocus = true } = {}) {
  if (!detailLayer) return;
  clearTimeout(detailSwitchTimer);
  if (REDUCED) {
    finishDetailClose(restoreFocus);
    return;
  }
  detailLayer.classList.add("is-closing");
  detailLayer.classList.remove("is-in");
  detailCloseTimer = setTimeout(() => finishDetailClose(restoreFocus), 420);
}

function openDetail(item, node, { replace = false } = {}) {
  clearTimeout(detailCloseTimer);
  clearTimeout(detailSwitchTimer);
  const source = sourceNodeFor(item.id) || node || null;
  const morphSource = node?.isConnected ? node : source;
  const replacement = detailNode(item);
  if (detailLayer && !replace) finishDetailClose(false);
  openId = item.id;
  detailSource = source;
  markExpanded(source);

  if (detailLayer && replace) {
    const old = detailLayer;
    old.classList.add("is-switching");
    const swap = () => {
      replacement.classList.add("is-in");
      old.replaceWith(replacement);
      detailLayer = replacement;
      replacement.querySelector(".media-detail-close")?.focus({ preventScroll: true });
    };
    if (REDUCED) swap();
    else detailSwitchTimer = setTimeout(swap, 150);
    return;
  }

  detailLayer = replacement;
  document.body.append(detailLayer);
  setMorphOrigin(detailLayer, morphSource);
  document.body.classList.add("media-detail-open");
  setPageInert(true);
  requestAnimationFrame(() => {
    detailLayer?.classList.add("is-in");
    detailLayer?.querySelector(".media-detail-close")?.focus({ preventScroll: true });
  });
}

export function wireExpansion(items, root) {
  const byId = new Map(items.map((i) => [i.id, i]));
  detailItems = items;
  detailRoot = root;

  root.addEventListener("click", (e) => {
    const node = e.target.closest("[data-id]");
    if (!node) return;
    const item = byId.get(node.dataset.id);
    if (!item) return;
    openDetail(item, node);
  });

  document.addEventListener("keydown", (e) => {
    if (!detailLayer) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeDetail();
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const current = byId.get(openId);
      if (!current) return;
      const sequence = detailSequence(current);
      const item = e.key === "ArrowLeft" ? sequence.previous : sequence.next;
      e.preventDefault();
      openDetail(item, sourceNodeFor(item.id), { replace: true });
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = [...detailLayer.querySelectorAll("button, a[href], [tabindex]:not([tabindex='-1'])")]
      .filter((node) => !node.disabled && node.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  /* arrow keys walk a shelf */
  root.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const cur = e.target.closest("[data-id]");
    if (!cur || cur.closest(".coverflow")) return;
    const sibs = [...cur.parentElement.querySelectorAll("[data-id]")];
    const direction = e.key === "ArrowRight" ? 1 : -1;
    const currentIndex = sibs.indexOf(cur);
    let next = sibs[currentIndex + direction];
    if (!next && cur.closest(".book-cover-run")) {
      next = direction > 0 ? sibs[0] : sibs[sibs.length - 1];
    }
    if (next) {
      next.focus();
      e.preventDefault();
    }
  });
}

/* Used by the hero: jump to an item's shelf and open it. */
export function openItem(id) {
  const matches = [...document.querySelectorAll(`#shelves [data-id="${CSS.escape(id)}"]`)];
  const node = matches.find((candidate) => !candidate.closest("[data-loop-clone]")) || matches[0];
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
  const { initHero } = await import("./library-hero.js?v=detail-stage3");
  initHero(items);
}

main();
