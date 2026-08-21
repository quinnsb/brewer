import { isAuthed } from "./lib/session.mjs";
import { json } from "./lib/http.mjs";

/* The admin page asks this on load to decide whether to show the login form or
   the editor. It is deliberately the only endpoint that answers without auth. */
export default async function handler(req, res) {
  return json(res, 200, { authed: isAuthed(req) });
}
