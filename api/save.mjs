import { isAuthed } from "./lib/session.mjs";
import { readJson as readBody, json, methodNotAllowed } from "./lib/http.mjs";
import { readJson, readText, writeFiles, storeMode } from "./lib/store.mjs";
import { itemWithNote, buildNote } from "./lib/apply-note.mjs";

const HALF_STEP = (value) => Number.isFinite(value) && value >= 0 && value <= 5 && value * 2 === Math.round(value * 2);

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!isAuthed(req)) return json(res, 401, { error: "Not signed in" });

  const body = await readBody(req);
  const { id, title, creator, year, starred = false, finished = null, review = "" } = body;
  if (!id || !/^[a-z0-9-]+$/.test(id)) return json(res, 400, { error: "Bad or missing id" });

  /* Validated here as well as in mergeItem, because a 400 that names the
     problem is more use than a save that quietly drops the rating. */
  let rating = body.rating;
  if (rating === "" || rating === undefined) rating = null;
  if (rating !== null) {
    rating = Number(rating);
    if (!HALF_STEP(rating)) return json(res, 400, { error: "Rating must be 0 to 5 in half steps" });
  }
  if (finished && !/^\d{4}(-\d{2}){0,2}$/.test(finished)) {
    return json(res, 400, { error: "Finished should look like 2026, 2026-03, or 2026-03-14" });
  }

  const [published, raw, taxonomy, listening, palette] = await Promise.all([
    readJson("data/library.json"),
    readJson("data/library.raw.json"),
    readJson("data/library-taxonomy.json", {}),
    readJson("data/library-listening.json", {}),
    readJson("data/library-palette.json", {}),
  ]);
  if (!published || !raw) return json(res, 500, { error: "Could not read the library data files" });

  /* Frontmatter keys that only correct synced metadata are preserved from the
     note already on disk, so saving a rating never quietly reverts a title fix.
     The request may override them explicitly. */
  const existingNote = await readText(`content/library/${id}.md`);
  const previous = existingNote ? parseExistingFront(existingNote) : {};

  const noteText = buildNote({
    title: title ?? previous.title,
    creator: creator ?? previous.creator,
    year: year ?? previous.year,
    rating, starred: starred === true, finished,
    body: review,
  });

  let result;
  try {
    result = itemWithNote({ items: published.items, rawItems: raw.items, taxonomy, listening, palette, id, noteText });
  } catch (err) {
    return json(res, 400, { error: err.message });
  }

  const files = [{
    path: "data/library.json",
    content: JSON.stringify({ generatedAt: new Date().toISOString(), items: result.items }, null, 2),
  }];
  /* A note with nothing in it is deleted rather than written empty. Deleting
     through the trees API needs a different shape, so for now an emptied note
     becomes a bare frontmatter fence, which the build already treats as no note. */
  files.unshift({ path: `content/library/${id}.md`, content: noteText ?? "---\n---\n" });

  try {
    const written = await writeFiles(files, `Update ${id} from the library admin`);
    return json(res, 200, { ok: true, item: result.item, warnings: result.warnings, ...written });
  } catch (err) {
    return json(res, 502, { error: `Could not save: ${err.message}` });
  }
}

/* Only the sync-correcting keys. Rating, starred and finished always come from
   the request, because those are exactly what the form owns. */
function parseExistingFront(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split(/\r?\n/)) {
    const cut = line.indexOf(":");
    if (cut === -1) continue;
    const key = line.slice(0, cut).trim();
    if (!["title", "creator", "year"].includes(key)) continue;
    out[key] = line.slice(cut + 1).trim();
  }
  return out;
}
