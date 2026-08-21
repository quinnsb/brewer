import { isAuthed } from "./lib/session.mjs";
import { json, methodNotAllowed } from "./lib/http.mjs";
import { search } from "./lib/sources.mjs";
import { itemId } from "../tools/lib/identity.mjs";
import { readJson } from "./lib/store.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (!isAuthed(req)) return json(res, 401, { error: "Not signed in" });

  const params = new URL(req.url, "http://localhost").searchParams;
  const type = params.get("type");
  const query = params.get("q") || "";

  try {
    const [results, published] = await Promise.all([search(type, query), readJson("data/library.json", { items: [] })]);
    const have = new Set(published.items.map((item) => item.id));

    /* The catalogues happily return a record several times over, once per
       edition or reissue. Those collapse to one id here, so the two rows would
       be identical on screen and the second would only ever be refused as a
       duplicate. Keeping the first is enough. */
    const seen = new Set();
    const candidates = [];
    for (const candidate of results) {
      const id = itemId(candidate.type, candidate.title);
      if (seen.has(id)) continue;
      seen.add(id);
      /* Marked rather than filtered, because seeing that you already own a
         thing is more useful than watching it silently missing. */
      candidates.push({ ...candidate, id, already: have.has(id) });
    }

    return json(res, 200, { results: candidates });
  } catch (err) {
    return json(res, 502, { error: err.message });
  }
}
