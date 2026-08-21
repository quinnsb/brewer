import { parseFrontmatter } from "./frontmatter.mjs";
import { renderMarkdown } from "./markdown.mjs";

/* One raw (synced) item plus its optional hand-written note becomes one
   published item. Sync owns facts it can fetch; the note owns everything a
   human decided, and always wins. */
export function mergeItem(raw, noteText, hasOverrideCover) {
  const { data, body } = noteText ? parseFrontmatter(noteText) : { data: {}, body: "" };
  const html = renderMarkdown(body);

  const merged = {
    ...raw,
    title: data.title ?? raw.title,
    creator: data.creator ?? raw.creator,
    year: data.year ?? raw.year,
    starred: data.starred === true,
    rating: data.rating ?? raw.rating ?? null,
    finished: data.finished ?? null,
    reviewHtml: html || null,
  };
  if (hasOverrideCover) merged.cover = `images/library/overrides/${raw.id}.jpg`;
  /* `note` was the old inline-review field; reviewHtml replaces it. */
  delete merged.note;
  return merged;
}
