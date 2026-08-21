import { isAuthed } from "./lib/session.mjs";
import { readJson as readBody, json, methodNotAllowed } from "./lib/http.mjs";
import { readJson, writeFiles } from "./lib/store.mjs";
import { addToCatalog } from "./lib/add-item.mjs";
import { buildNote } from "./lib/apply-note.mjs";
import { coverHostAllowed } from "./lib/sources.mjs";

const MAX_COVER = 8 * 1024 * 1024;
const HALF_STEP = (value) => Number.isFinite(value) && value >= 0 && value <= 5 && value * 2 === Math.round(value * 2);

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!isAuthed(req)) return json(res, 401, { error: "Not signed in" });

  const { candidate, genres = [], paletteEntry = null } = await readBody(req);
  if (!candidate?.title || !candidate?.type) return json(res, 400, { error: "Pick something first" });
  if (!coverHostAllowed(candidate.coverUrl)) return json(res, 400, { error: "That cover host is not on the allowlist" });

  /* A candidate from a feed arrives already rated and dated. Validated here the
     same way /api/save validates a typed one, so an import cannot write a
     rating the build would later warn about and drop. */
  let rating = candidate.rating;
  if (rating === "" || rating === undefined) rating = null;
  if (rating !== null) {
    rating = Number(rating);
    if (!HALF_STEP(rating)) return json(res, 400, { error: "Rating must be 0 to 5 in half steps" });
  }
  const finished = candidate.finished || null;
  if (finished && !/^\d{4}(-\d{2}){0,2}$/.test(finished)) {
    return json(res, 400, { error: "Finished should look like 2026, 2026-03, or 2026-03-14" });
  }
  const noteText = buildNote({ rating, starred: false, finished, body: "" });

  const [published, raw, additions, taxonomy, listening, palette] = await Promise.all([
    readJson("data/library.json"),
    readJson("data/library.raw.json"),
    readJson("data/library-additions.json", null),
    readJson("data/library-taxonomy.json", {}),
    readJson("data/library-listening.json", {}),
    readJson("data/library-palette.json", {}),
  ]);
  if (!published || !raw) return json(res, 500, { error: "Could not read the library data files" });

  let result;
  try {
    result = addToCatalog({ published, raw, additions, taxonomy, listening, palette, candidate, genres, paletteEntry, noteText });
  } catch (err) {
    return json(res, 400, { error: err.message });
  }

  /* Fetched here rather than trusting bytes from the browser, so what lands in
     the repo is what the catalogue actually serves. */
  let cover;
  try {
    const upstream = await fetch(candidate.coverUrl, { headers: { "user-agent": "brewer-library-admin/0.1" } });
    if (!upstream.ok) throw new Error(`cover host returned ${upstream.status}`);
    cover = Buffer.from(await upstream.arrayBuffer());
    if (cover.length > MAX_COVER) throw new Error("cover is larger than 8MB");
    if (!cover.length) throw new Error("cover was empty");
  } catch (err) {
    return json(res, 502, { error: `Could not fetch the cover: ${err.message}` });
  }

  const files = [
    { path: result.rawItem.cover, content: cover },
    /* Written only when the item arrived with a rating or a date, so a plain
       add still leaves no empty note behind. */
    ...(noteText ? [{ path: `content/library/${result.rawItem.id}.md`, content: noteText }] : []),
    { path: "data/library.raw.json", content: JSON.stringify(result.files.raw, null, 2) },
    { path: "data/library-additions.json", content: JSON.stringify(result.files.additions, null, 2) },
    { path: "data/library-taxonomy.json", content: JSON.stringify(result.files.taxonomy, null, 2) },
    { path: "data/library-palette.json", content: JSON.stringify(result.files.palette, null, 2) },
    { path: "data/library.json", content: JSON.stringify({ generatedAt: new Date().toISOString(), items: result.files.published.items }, null, 2) },
  ];

  try {
    const written = await writeFiles(files, `Add ${result.rawItem.title} from the library admin`);
    return json(res, 200, { ok: true, item: result.item, ...written });
  } catch (err) {
    return json(res, 502, { error: `Could not save: ${err.message}` });
  }
}
