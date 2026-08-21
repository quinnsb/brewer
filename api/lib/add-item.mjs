/* ============================================================
   ADD ITEM — a chosen candidate becomes a real catalog entry

   Five files move together, and they have to move in one commit:

     images/library/<id>.jpg      the cover
     data/library.raw.json        what sync owns
     data/library-additions.json  the seed, so a resync does not drop it
     data/library-palette.json    colour, sampled in the browser
     data/library.json            what the page reads

   The seed matters most. library-sync.mjs rebuilds library.raw.json from its
   own SEED list plus the import files, so without writing an addition back, the
   next sync would quietly erase anything added here.
   ============================================================ */

import { SHAPE, itemId, shelfGeometry } from "../../tools/lib/identity.mjs";
import { applyTaxonomy } from "../../tools/lib/taxonomy.mjs";
import { applyListening } from "../../tools/lib/listening.mjs";
import { applyPalette } from "../../tools/lib/palette.mjs";
import { mergeItem } from "../../tools/lib/merge.mjs";

export function rawItemFor(candidate) {
  const { type, title } = candidate;
  if (!SHAPE[type]) throw new Error(`Unknown type: ${type}`);
  if (!title?.trim()) throw new Error("A title is required");

  const id = itemId(type, title);
  return {
    id,
    type,
    shape: SHAPE[type].shape,
    aspect: SHAPE[type].aspect,
    title: title.trim(),
    creator: candidate.creator?.trim() || "",
    year: candidate.year ?? null,
    detail: candidate.detail || "",
    cover: `images/library/${id}.jpg`,
    sourceUrl: candidate.sourceUrl || "",
    catalogId: candidate.catalogId ?? null,
    listenEmbedUrl: null,
    tracks: [],
    rating: null,
    finished: null,
    facts: (candidate.facts || []).filter(([term, value]) => term && value !== null && value !== undefined),
    ...shelfGeometry(id),
    starred: false,
    note: null,
  };
}

/* The seed a later sync will re-resolve. Title, creator and year are pinned so
   sync's own resolver cannot rename the item out from under an existing note. */
export function seedFor(rawItem) {
  return {
    type: rawItem.type,
    query: `${rawItem.title} ${rawItem.creator}`.trim(),
    title: rawItem.title,
    creator: rawItem.creator || undefined,
    year: rawItem.year ?? undefined,
    sourceUrl: rawItem.sourceUrl || undefined,
  };
}

export function addToCatalog({ published, raw, additions, taxonomy, listening, palette, candidate, genres = [], paletteEntry, noteText = null }) {
  const rawItem = rawItemFor(candidate);
  if (raw.items.some((item) => item.id === rawItem.id)) {
    throw new Error(`${rawItem.title} is already in the library`);
  }
  /* applyTaxonomy refuses an item with no genres, and it is right to: genres
     drive the catalog filters, so an item without them is unreachable there.
     Caught here so the admin can say so plainly instead of relaying a build
     error from two modules away. */
  if (!genres.length || genres.some((genre) => typeof genre !== "string" || !genre.trim())) {
    throw new Error("Pick at least one genre. Items without genres cannot be filtered in the catalog.");
  }

  const nextRaw = { ...raw, items: [...raw.items, rawItem] };
  const nextAdditions = {
    importedAt: new Date().toISOString(),
    source: "library-admin",
    items: [...(additions?.items || []), seedFor(rawItem)],
  };

  /* Genres chosen in the admin are taxonomy, exactly like the hand-maintained
     file, so they go in the same place rather than onto the item. An entry is
     always written, empty if none were picked, because applyTaxonomy refuses an
     item it has no entry for at all. */
  const nextTaxonomy = { ...taxonomy, [rawItem.id]: genres };
  const nextPalette = paletteEntry ? { ...palette, [rawItem.id]: paletteEntry } : palette;

  /* applyTaxonomy and applyListening both refuse ids they cannot see, which is
     the right behaviour for a whole-catalog build and the wrong shape for one
     item, so both maps are scoped down to this id first. */
  const scoped = (map) => (map?.[rawItem.id] === undefined ? {} : { [rawItem.id]: map[rawItem.id] });
  const catalog = applyTaxonomy(applyListening([rawItem], scoped(listening)), scoped(nextTaxonomy));
  /* An item arriving from Goodreads or Letterboxd already has a rating and a
     date watched or read. Those live in the note, exactly as a hand-typed one
     does, so the merge is what puts them on the item. */
  const merged = mergeItem(catalog[0], noteText, false, () => {});
  const [item] = applyPalette([merged], nextPalette);

  return {
    item,
    rawItem,
    files: {
      raw: nextRaw,
      additions: nextAdditions,
      taxonomy: nextTaxonomy,
      palette: nextPalette,
      published: { ...published, items: [...published.items, item] },
    },
  };
}
