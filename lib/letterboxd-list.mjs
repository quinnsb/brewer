/* ============================================================
   LETTERBOXD LIST — the whole watched list, not just the recent feed

   letterboxd.com/<user>/rss/ is a window: the last forty-odd diary entries.
   The profile's film grid at letterboxd.com/<user>/films/ is the whole thing,
   paginated, and it carries exactly what is needed: the title, the year, and
   the rating. So this reads that.

   Each poster in the grid looks like:

     data-item-full-display-name="The Drama (2026)"
     data-target-link="/film/the-drama/"
     <span class="rating -micro -darker rated-8">

   `rated-N` counts half stars, so N/2 is the rating out of five. A film with no
   rating simply has no span, which is a real state and not an error: it was
   watched and not scored.

   Parsing is by hand rather than with a DOM library because the repo has no
   dependencies, and it is pinned by tests against captured markup so a layout
   change on their side fails loudly here rather than silently returning nothing.
   ============================================================ */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };

function decode(text) {
  return String(text ?? "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
      if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16));
      if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)));
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .trim();
}

/* "The Drama (2026)" -> { title: "The Drama", year: 2026 }. The year is only
   taken off the end, so a title that genuinely ends in a parenthetical keeps it
   unless it looks like a four digit year. */
export function splitDisplayName(display) {
  const name = decode(display);
  const match = /^(.*)\s+\((\d{4})\)\s*$/.exec(name);
  if (!match) return { title: name, year: null };
  return { title: match[1].trim(), year: Number(match[2]) };
}

/* Each grid item is one <li>, so the page is split on those rather than matched
   across the whole document: that keeps a rating with the poster it belongs to
   instead of pairing it with whichever came next. */
export function parseFilmGrid(html) {
  const chunks = String(html ?? "").split(/<li class="griditem"/).slice(1);
  const films = [];

  for (const chunk of chunks) {
    const display = /data-item-full-display-name="([^"]+)"/.exec(chunk);
    if (!display) continue;
    const { title, year } = splitDisplayName(display[1]);
    if (!title) continue;

    const rated = /class="rating[^"]*\brated-(\d{1,2})\b[^"]*"/.exec(chunk);
    const halves = rated ? Number(rated[1]) : 0;
    const slug = /data-target-link="\/film\/([^"/]+)\//.exec(chunk);

    films.push({
      type: "film",
      title,
      year,
      /* Out of five, in half steps, which is what the site stores. */
      rating: halves > 0 && halves <= 10 ? halves / 2 : null,
      letterboxdSlug: slug ? slug[1] : null,
    });
  }

  return films;
}

/* The pager only links a few pages, so the largest it mentions is the count. A
   single-page list has no pager at all, which is one page. */
export function lastPage(html) {
  const pages = [...String(html ?? "").matchAll(/\/films\/page\/(\d+)/g)].map((m) => Number(m[1]));
  return pages.length ? Math.max(...pages) : 1;
}

export function filmsPageUrl(username, page = 1) {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{0,30}$/.test(String(username))) {
    throw new Error(`${username} is not a valid Letterboxd username`);
  }
  return page > 1
    ? `https://letterboxd.com/${username}/films/page/${page}/`
    : `https://letterboxd.com/${username}/films/`;
}
