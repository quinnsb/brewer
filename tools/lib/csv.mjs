export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((header) => header.trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function goodreadsItems(rows) {
  return rows.filter((row) => row.Title).map((row) => {
    const ignoredShelves = new Set(["read", "currently-reading", "to-read", "owned"]);
    const genres = String(row.Bookshelves || "").split(",")
      .map((value) => value.trim())
      .filter((value) => value && !ignoredShelves.has(value))
      .map((value) => value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
    return {
      type: "book",
      query: `${row.Title} ${row.Author || ""}`.trim(),
      title: row.Title,
      creator: row.Author || "Unknown",
      year: Number(row["Original Publication Year"] || row["Year Published"]) || null,
      rating: Number(row["My Rating"]) || null,
      finished: row["Date Read"] || null,
      genres,
      sourceId: row["Book Id"] || null,
      source: "goodreads-export",
    };
  });
}

export function letterboxdItems(watchedRows, ratingRows = []) {
  const ratings = new Map(ratingRows.map((row) => [`${row.Name}\u0000${row.Year}`, Number(row.Rating) || null]));
  return watchedRows.filter((row) => row.Name).map((row) => ({
    type: "film",
    query: `${row.Name}${row.Year ? ` (${row.Year} film)` : ""}`,
    title: row.Name,
    year: Number(row.Year) || null,
    rating: ratings.get(`${row.Name}\u0000${row.Year}`) ?? null,
    finished: row.Date || null,
    sourceUrl: row["Letterboxd URI"] || null,
    source: "letterboxd-export",
  }));
}
