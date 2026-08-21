/* ============================================================
   IMPORT — what Goodreads and Letterboxd have that the library does not

   Read only. This endpoint proposes; nothing is written until a candidate is
   accepted, which goes through /api/add like any other new item. A feed will
   happily offer a book that was abandoned halfway, or a film watched once on a
   plane, so every candidate is reviewed by a human before it lands.

   One feed being down is not a failure: the other half is still useful, so
   errors are reported alongside whatever did come back.
   ============================================================ */

import { isAuthed } from "../lib/session.mjs";
import { readJson as readBody, json, methodNotAllowed } from "../lib/http.mjs";
import { readJson, writeFiles } from "../lib/store.mjs";
import { withRetry } from "../lib/sources.mjs";
import { feedUrls, parseGoodreads, parseLetterboxd, newCandidates } from "../lib/feeds.mjs";

const UA = "brewer-library-admin/0.1 ( https://www.quinnbrewer.com )";
const TIMEOUT_MS = 12000;

async function fetchFeed(url) {
  return withRetry(async () => {
    let response;
    try {
      response = await fetch(url, {
        headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`${new URL(url).hostname} did not answer: ${err.cause?.message || err.message}`);
    }
    if (!response.ok) {
      const error = new Error(`${new URL(url).hostname} returned ${response.status}`);
      error.permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
      throw error;
    }
    return response.text();
  });
}

const SKIPPED = "data/library-skipped.json";

/* A feed offers everything on the shelf, including the books that were started
   and put down. Without somewhere to record a no, every visit re-offers the
   same hundred and the queue never empties. */
async function setSkipped(req, res) {
  const { op, id } = await readBody(req);
  if (!id || typeof id !== "string") return json(res, 400, { error: "Which one?" });
  if (op !== "skip" && op !== "unskip") return json(res, 400, { error: `Unknown operation: ${op}` });

  const current = await readJson(SKIPPED, { ids: [] });
  const ids = new Set(current.ids || []);
  if (op === "skip") ids.add(id);
  else ids.delete(id);

  const next = { ids: [...ids].sort() };
  try {
    const written = await writeFiles(
      [{ path: SKIPPED, content: JSON.stringify(next, null, 2) + "\n" }],
      op === "skip" ? `Skip ${id} in the library import` : `Un-skip ${id} in the library import`
    );
    return json(res, 200, { skipped: next.ids, ...written });
  } catch (err) {
    return json(res, 502, { error: `Could not save: ${err.message}` });
  }
}

export default async function handler(req, res) {
  if (!isAuthed(req)) return json(res, 401, { error: "Not signed in" });
  if (req.method === "POST") return setSkipped(req, res);
  if (req.method !== "GET") return methodNotAllowed(res, ["GET", "POST"]);

  const [sources, published, skipped] = await Promise.all([
    readJson("data/library-sources.json", {}),
    readJson("data/library.json", { items: [] }),
    readJson(SKIPPED, { ids: [] }),
  ]);
  const declined = new Set(skipped.ids || []);

  let urls;
  try {
    urls = feedUrls(sources);
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
  if (!urls.goodreads && !urls.letterboxd) {
    return json(res, 500, { error: "No feeds configured. Set them in data/library-sources.json." });
  }

  const errors = [];
  const parsed = [];

  /* Both feeds are fetched at once and settled independently, so a Goodreads
     outage still lets the films through. */
  const results = await Promise.allSettled([
    urls.goodreads ? fetchFeed(urls.goodreads).then((xml) => ["goodreads", parseGoodreads(xml)]) : null,
    urls.letterboxd ? fetchFeed(urls.letterboxd).then((xml) => ["letterboxd", parseLetterboxd(xml)]) : null,
  ].filter(Boolean));

  for (const result of results) {
    if (result.status === "fulfilled") parsed.push(...result.value[1]);
    else errors.push(result.reason.message);
  }

  const candidates = newCandidates(parsed, published.items).filter((candidate) => !declined.has(candidate.id));
  /* Newest first: what was read or watched last week is what Quinn actually
     remembers well enough to rate and write about. */
  candidates.sort((a, b) => String(b.finished ?? "").localeCompare(String(a.finished ?? "")));

  return json(res, 200, {
    candidates,
    errors,
    seen: parsed.length,
    skipped: [...declined],
    sources: {
      goodreads: sources.goodreads?.profileUrl ?? null,
      letterboxd: sources.letterboxd?.profileUrl ?? null,
    },
  });
}
