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

/* ============================================================
   LISTS

   A list page is not the profile grid. Its entries are

     <li class="posteritem numbered-list-item" data-owner-rating="10" ...>
       <div class="react-component" data-item-name="Spirited Away (2001)"
            data-item-slug="spirited-away" data-item-link="/film/spirited-away/">

   so the container class, the attribute carrying the name, and where the
   rating lives are all different from the grid, and none of parseFilmGrid
   applies. The rating is on the <li> rather than in a span, and it is the list
   owner's, out of ten in half steps.

   Order is the ranking. These are read in DOM order and never sorted: on a
   ranked list the position is the whole point, and on an unranked one the
   author's order is still the order they chose.
   ============================================================ */

export function parseListPage(html) {
  const chunks = String(html ?? "").split(/<li class="posteritem/).slice(1);
  const films = [];

  for (const chunk of chunks) {
    const name = /data-item-name="([^"]+)"/.exec(chunk);
    if (!name) continue;
    const { title, year } = splitDisplayName(name[1]);
    if (!title) continue;

    /* On the <li> we just split on, so it is in this chunk's opening tag. */
    const rated = /^[^>]*\bdata-owner-rating="(\d{1,2})"/.exec(chunk);
    const halves = rated ? Number(rated[1]) : 0;
    const slug = /data-item-slug="([^"]+)"/.exec(chunk);

    films.push({
      type: "film",
      title,
      year,
      rating: halves > 0 && halves <= 10 ? halves / 2 : null,
      letterboxdSlug: slug ? slug[1] : null,
    });
  }

  return films;
}

/* The pager links /list/<slug>/page/N. A list short enough to fit one page has
   no pager, which is one page. */
export function lastListPage(html, slug) {
  const escaped = String(slug).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`/list/${escaped}/page/(\\d+)`, "g");
  const pages = [...String(html ?? "").matchAll(pattern)].map((m) => Number(m[1]));
  return pages.length ? Math.max(...pages) : 1;
}

/* The list's own title, so an imported list is named what its author named it
   rather than what its URL slug happens to spell. */
export function listTitle(html) {
  const meta = /<meta property="og:title" content="([^"]+)"/.exec(String(html ?? ""));
  return meta ? decode(meta[1]) : null;
}

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$/;

export function listPageUrl(username, slug, page = 1) {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{0,30}$/.test(String(username))) {
    throw new Error(`${username} is not a valid Letterboxd username`);
  }
  if (!SLUG.test(String(slug))) throw new Error(`${slug} is not a valid Letterboxd list slug`);
  return page > 1
    ? `https://letterboxd.com/${username}/list/${slug}/page/${page}/`
    : `https://letterboxd.com/${username}/list/${slug}/`;
}
