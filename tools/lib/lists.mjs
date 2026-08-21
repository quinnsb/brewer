/* ============================================================
   LISTS — the curated shelves, as data

   The lists page used to render twelve hardcoded title strings and the words
   "List coming later". There was no membership, no ordering, no model. This is
   the model:

     { id, type, title, intro, ranked, items: [itemId, ...] }

   `id` is a URL (`library-lists.html?list=<id>`), so it is derived from the
   title once at creation and never moves again, however often the title is
   rewritten. `items` is authored order, which is the whole point of a ranked
   list, so nothing here ever sorts it.

   Structural problems throw: a duplicate id, an unknown type, a missing title,
   a film in a book list. Those are authoring mistakes the admin can prevent at
   the point of the click. An id that no longer exists in the library is only a
   warning, because an item can legitimately leave the catalog long after a list
   was built and that must not fail a build.

   Everything here is pure and returns new objects, so the admin can hold a
   draft and the build can validate without either surprising the other.
   ============================================================ */

import { slug, SHAPE } from "./identity.mjs";

export function validateLists(lists, items) {
  if (!Array.isArray(lists)) throw new Error("Lists must be an array");

  const known = new Map(items.map((item) => [item.id, item]));
  const seenIds = new Set();
  const warnings = [];

  for (const list of lists) {
    if (!list?.id || !String(list.id).trim()) throw new Error("Every list needs an id");
    if (seenIds.has(list.id)) throw new Error(`Duplicate list id: ${list.id}`);
    seenIds.add(list.id);

    if (!SHAPE[list.type]) throw new Error(`Unknown type on list ${list.id}: ${list.type}`);
    if (!list.title || !String(list.title).trim()) throw new Error(`List ${list.id} needs a title`);
    if (!Array.isArray(list.items)) throw new Error(`List ${list.id} needs an items array`);

    const seenItems = new Set();
    for (const id of list.items) {
      if (seenItems.has(id)) throw new Error(`${id} is listed twice in ${list.id}`);
      seenItems.add(id);

      const item = known.get(id);
      if (!item) {
        warnings.push(`list ${list.id} refers to ${id}, which is not in the library`);
        continue;
      }
      if (item.type !== list.type) {
        throw new Error(`${id} is a ${item.type} but ${list.id} is a ${list.type} list`);
      }
    }
  }

  return { warnings };
}

/* Ids become items, in authored order. A missing id is dropped rather than
   left as a hole, so nothing downstream has to guard for a null. */
export function resolveLists(lists, items) {
  const known = new Map(items.map((item) => [item.id, item]));
  return lists.map((list) => {
    const resolved = list.items.map((id) => known.get(id)).filter(Boolean);
    return {
      id: list.id,
      type: list.type,
      title: list.title,
      intro: list.intro || "",
      ranked: Boolean(list.ranked),
      items: resolved,
      count: resolved.length,
    };
  });
}

/* The id is derived once and then frozen, so a retitle cannot break a link
   someone already shared. A collision gets a counter rather than a rejection,
   because two lists really can deserve similar names. */
function freshId(lists, title) {
  const base = slug(title);
  if (!base) throw new Error("A list needs a title with letters or numbers in it");
  const taken = new Set(lists.map((list) => list.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function createList(lists, { type, title }) {
  if (!SHAPE[type]) throw new Error(`Unknown type: ${type}`);
  const id = freshId(lists, title || "");
  return [...lists, { id, type, title: String(title).trim(), intro: "", ranked: false, items: [] }];
}

function replace(lists, id, change) {
  const index = lists.findIndex((list) => list.id === id);
  if (index === -1) throw new Error(`There is no list called ${id}`);
  const next = [...lists];
  next[index] = change(lists[index]);
  return next;
}

/* Only the words are editable. Type is structural and items have their own
   operations, so an errant field in a request body cannot quietly move either. */
export function updateList(lists, id, { title, intro, ranked } = {}) {
  return replace(lists, id, (list) => {
    if (title !== undefined && !String(title).trim()) throw new Error(`List ${id} needs a title`);
    return {
      ...list,
      title: title === undefined ? list.title : String(title).trim(),
      intro: intro === undefined ? list.intro : String(intro).trim(),
      ranked: ranked === undefined ? list.ranked : Boolean(ranked),
    };
  });
}

export function deleteList(lists, id) {
  if (!lists.some((list) => list.id === id)) throw new Error(`There is no list called ${id}`);
  return lists.filter((list) => list.id !== id);
}

export function addToList(lists, id, itemId, items) {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`${itemId} is not in the library`);
  return replace(lists, id, (list) => {
    if (item.type !== list.type) throw new Error(`${itemId} is a ${item.type} and this is a ${list.type} list`);
    if (list.items.includes(itemId)) throw new Error(`${item.title} is already on this list`);
    return { ...list, items: [...list.items, itemId] };
  });
}

export function removeFromList(lists, id, itemId) {
  return replace(lists, id, (list) => {
    if (!list.items.includes(itemId)) throw new Error(`${itemId} is not in that list`);
    return { ...list, items: list.items.filter((candidate) => candidate !== itemId) };
  });
}

/* Up and down by one, swapping with the neighbour. Off either end is a no-op so
   the admin can render the buttons without disabling them at the boundaries. */
export function moveInList(lists, id, itemId, direction) {
  return replace(lists, id, (list) => {
    const from = list.items.indexOf(itemId);
    if (from === -1) throw new Error(`${itemId} is not in that list`);
    const to = from + (direction < 0 ? -1 : 1);
    if (to < 0 || to >= list.items.length) return list;
    const items = [...list.items];
    [items[from], items[to]] = [items[to], items[from]];
    return { ...list, items };
  });
}
