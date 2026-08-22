export function applyTaxonomy(items, taxonomy) {
  const ids = new Set(items.map((item) => item.id));
  const unknown = Object.keys(taxonomy).filter((id) => !ids.has(id));
  if (unknown.length) {
    throw new Error(`Taxonomy contains unknown item ids: ${unknown.join(", ")}`);
  }

  return items.map((item) => {
    const genres = taxonomy[item.id] ?? item.genres;
    if (!Array.isArray(genres) || !genres.length || genres.some((genre) => typeof genre !== "string" || !genre.trim())) {
      throw new Error(`Missing genres for ${item.id}`);
    }
    /* An absent creator stays absent. Substituting "Unknown" here is what put a
       director of that name in the catalog filter, on the byline of 87 films,
       and behind a ?creator=Unknown link that listed most of the collection.
       Consumers check for an empty list instead. */
    const splitPeople = item.type === "film" || item.type === "other";
    const authored = String(item.creator || "").trim();
    const creators = !authored
      ? []
      : splitPeople
        ? authored.split(/\s*,\s*|\s+and\s+/i).filter(Boolean)
        : [authored];
    return {
      ...item,
      genres: [...new Set(genres.map((genre) => genre.trim()))],
      creators: [...new Set(creators.map((creator) => creator.trim()).filter(Boolean))],
    };
  });
}
