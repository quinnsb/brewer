/* ============================================================
   LISTS — read the curated lists, and change them one operation at a time

   A POST carries an operation, not a whole file. That matters for two reasons:
   every change is validated on the server against the real catalog, so a
   crafted body cannot put a film on a book list; and two open tabs cannot
   clobber each other, because neither one is ever sending its own idea of what
   the whole file should say.

   The response is always the full list set after the change, so the panel
   re-renders from the server's answer rather than guessing.
   ============================================================ */

import { isAuthed } from "../lib/session.mjs";
import { readJson as readBody, json, methodNotAllowed } from "../lib/http.mjs";
import { readJson, writeFiles } from "../lib/store.mjs";
import {
  validateLists, createList, updateList, deleteList,
  addToList, removeFromList, moveInList,
} from "../tools/lib/lists.mjs";

const FILE = "data/library-lists.json";

const titleOf = (lists, id) => lists.find((list) => list.id === id)?.title ?? id;

/* Each op returns the next lists and the sentence that will become the commit
   message, because "Update lists" tells you nothing six months later. */
const OPS = {
  create: (lists, { type, title }) => ({
    lists: createList(lists, { type, title }),
    message: `Add the ${title} list from the library admin`,
  }),
  update: (lists, { id, title, intro, ranked }) => ({
    lists: updateList(lists, id, { title, intro, ranked }),
    message: `Edit the ${titleOf(lists, id)} list from the library admin`,
  }),
  delete: (lists, { id }) => ({
    lists: deleteList(lists, id),
    message: `Delete the ${titleOf(lists, id)} list from the library admin`,
  }),
  add: (lists, { id, itemId }, items) => ({
    lists: addToList(lists, id, itemId, items),
    message: `Add ${itemId} to the ${titleOf(lists, id)} list`,
  }),
  remove: (lists, { id, itemId }) => ({
    lists: removeFromList(lists, id, itemId),
    message: `Remove ${itemId} from the ${titleOf(lists, id)} list`,
  }),
  move: (lists, { id, itemId, direction }) => ({
    lists: moveInList(lists, id, itemId, Number(direction) < 0 ? -1 : 1),
    message: `Reorder the ${titleOf(lists, id)} list`,
  }),
};

export default async function handler(req, res) {
  if (!isAuthed(req)) return json(res, 401, { error: "Not signed in" });

  if (req.method === "GET") {
    return json(res, 200, { lists: await readJson(FILE, []) });
  }
  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);

  const body = await readBody(req);
  const op = OPS[body.op];
  if (!op) return json(res, 400, { error: `Unknown operation: ${body.op}` });

  const [lists, published] = await Promise.all([
    readJson(FILE, []),
    readJson("data/library.json", { items: [] }),
  ]);

  let next;
  let message;
  try {
    ({ lists: next, message } = op(lists, body, published.items));
    /* Belt and braces: the operations each guard their own case, but the file
       as a whole is what the build and the page will read, so it is the thing
       actually worth checking before it is written. */
    validateLists(next, published.items);
  } catch (err) {
    return json(res, 400, { error: err.message });
  }

  try {
    const written = await writeFiles([{ path: FILE, content: JSON.stringify(next, null, 2) + "\n" }], message);
    return json(res, 200, { lists: next, ...written });
  } catch (err) {
    return json(res, 502, { error: `Could not save: ${err.message}` });
  }
}
