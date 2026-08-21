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
    const splitPeople = item.type === "film" || item.type === "other";
    const creators = splitPeople
      ? String(item.creator || "Unknown").split(/\s*,\s*|\s+and\s+/i).filter(Boolean)
      : [item.creator || "Unknown"];
    return {
      ...item,
      genres: [...new Set(genres.map((genre) => genre.trim()))],
      creators: [...new Set(creators.map((creator) => creator.trim()))],
    };
  });
}
