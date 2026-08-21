/* ============================================================
   APPLY NOTE — one saved note, folded into the published catalog

   The admin cannot run tools/library-build.mjs; it has no shell and, on Linux,
   no sips. So it recomputes exactly the one item that changed, using the same
   modules the local build uses, and leaves every other item untouched.

   That sameness is the point: running the real build after an admin save must
   produce no diff, or the two writers have drifted apart.
   ============================================================ */

import { mergeItem } from "../../tools/lib/merge.mjs";
import { applyTaxonomy } from "../../tools/lib/taxonomy.mjs";
import { applyListening } from "../../tools/lib/listening.mjs";
import { applyPalette } from "../../tools/lib/palette.mjs";

const OVERRIDE_PREFIX = "images/library/overrides/";

export function buildNote({ rating, starred, finished, creator, title, year, body }) {
  const front = [];
  if (title) front.push(`title: ${title}`);
  if (creator) front.push(`creator: ${creator}`);
  if (year !== undefined && year !== null && year !== "") front.push(`year: ${year}`);
  if (rating !== undefined && rating !== null && rating !== "") front.push(`rating: ${rating}`);
  if (starred) front.push("starred: true");
  if (finished) front.push(`finished: ${finished}`);

  const prose = (body || "").trim();
  /* A note that would carry nothing is not worth writing, and an empty file on
     disk is indistinguishable from a note someone meant to fill in. */
  if (!front.length && !prose) return null;
  return `---\n${front.join("\n")}\n---\n${prose ? `\n${prose}\n` : ""}`;
}

export function itemWithNote({ items, rawItems, taxonomy, listening, palette, id, noteText }) {
  const existing = items.find((item) => item.id === id);
  if (!existing) throw new Error(`Unknown item: ${id}`);

  const catalog = applyTaxonomy(applyListening(rawItems, listening), taxonomy);
  const raw = catalog.find((item) => item.id === id);
  if (!raw) throw new Error(`No raw entry for ${id}. Run tools/library-sync.mjs first.`);

  /* Whether a hand-placed override cover exists is a fact about the images
     directory, which costs a round trip to ask. The published item already
     records the answer in its cover path. */
  const hasOverride = String(existing.cover || "").startsWith(OVERRIDE_PREFIX);

  const warnings = [];
  const merged = mergeItem(raw, noteText, hasOverride, (message) => warnings.push(message.trim()));
  const [withPalette] = applyPalette([merged], palette);

  return {
    items: items.map((item) => (item.id === id ? withPalette : item)),
    item: withPalette,
    warnings,
  };
}
