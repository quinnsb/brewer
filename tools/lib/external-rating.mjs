/* ============================================================
   EXTERNAL RATING — the outside score, as a number

   The catalog page has always offered "sort by outside rating", but the number
   only ever lived as a string inside `facts`, and nothing ever wrote the
   `externalRating` field the sort reads. So the comparator fell through to -1
   for every item and the option did nothing at all.

   The facts row stays exactly as it was, because the panel still displays it.
   This only lifts a copy out into a field the client can sort on.
   ============================================================ */

/* Only TMDB today. Kept as a list so a books or records source can be added
   without touching the shape of anything downstream. */
const RATING_FACTS = ["TMDB rating"];

const SCALE_MAX = 10;

function ratingFrom(facts) {
  for (const [label, value] of facts || []) {
    if (!RATING_FACTS.includes(label)) continue;
    const score = Number(value);
    /* A zero is TMDB's "nobody has voted", not a verdict, so it is refused
       alongside anything unparseable or off the scale. */
    if (!Number.isFinite(score) || score <= 0 || score > SCALE_MAX) continue;
    return score;
  }
  return null;
}

export function applyExternalRatings(items) {
  return items.map((item) => ({ ...item, externalRating: ratingFrom(item.facts) }));
}
