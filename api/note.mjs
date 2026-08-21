import { isAuthed } from "./lib/session.mjs";
import { json, methodNotAllowed } from "./lib/http.mjs";
import { readText, storeMode } from "./lib/store.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (!isAuthed(req)) return json(res, 401, { error: "Not signed in" });

  const id = new URL(req.url, "http://localhost").searchParams.get("id");
  if (!id || !/^[a-z0-9-]+$/.test(id)) return json(res, 400, { error: "Bad or missing id" });

  /* No note yet is the normal case for 83 of 84 items, not an error. */
  return json(res, 200, { id, note: await readText(`content/library/${id}.md`), mode: storeMode() });
}
