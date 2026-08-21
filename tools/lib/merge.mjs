import { parseFrontmatter } from "./frontmatter.mjs";
import { renderMarkdown } from "./markdown.mjs";

/* Ratings are 0 to 5 in half steps, which is what Goodreads and Letterboxd
   export, so imported values carry over without translation. Anything else is
   a typo in a hand-written note, and a silent drop is how a typo hides a
   missing rating for months. */
function validRating(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 5 && number * 2 === Math.round(number * 2);
}

/* One raw (synced) item plus its optional hand-written note becomes one
   published item. Sync owns facts it can fetch; the note owns everything a
   human decided, and always wins. */
export function mergeItem(raw, noteText, hasOverrideCover, onWarn = console.warn) {
  const { data, body } = noteText ? parseFrontmatter(noteText) : { data: {}, body: "" };
  const html = renderMarkdown(body);

  let rating = data.rating ?? raw.rating ?? null;
  if (rating !== null && !validRating(rating)) {
    onWarn(`  WARN  ${raw.id}: rating ${JSON.stringify(rating)} is not 0 to 5 in half steps, dropping it`);
    rating = null;
  }

  const merged = {
    ...raw,
    title: data.title ?? raw.title,
    creator: data.creator ?? raw.creator,
    year: data.year ?? raw.year,
    starred: data.starred === true,
    rating: rating === null ? null : Number(rating),
    finished: data.finished ?? raw.finished ?? null,
    reviewHtml: html || null,
  };
  if (hasOverrideCover) merged.cover = `images/library/overrides/${raw.id}.jpg`;
  /* `note` was the old inline-review field; reviewHtml replaces it. */
  delete merged.note;
  return merged;
}
