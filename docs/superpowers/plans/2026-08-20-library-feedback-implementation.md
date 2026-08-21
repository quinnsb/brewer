# Library feedback implementation

## Shipped in this pass

1. Refine the hero lockup, limit its verbs to the media represented on the page,
   remove the cover flip, and hide the finished arc behind a scroll-driven matte.
2. Add the portfolio menu and footer without importing the global site stylesheet.
3. Add per-shelf links to a curated-list index that can grow without changing the
   primary library page.
4. Remove visitor-authored ratings. A rating is now display-only and appears only
   when Quinn adds `rating: 4.5` to an item's file in `content/library/`.
5. Expand the starting podcast shelf and rebuild the generated catalogue.

## Admin boundary

This repository is a static site. A page deployed with it cannot securely prove
that an editor is Quinn or write back to the repository. A client-only admin page
would therefore be decorative security and is intentionally not included.

The production admin should be a separate authenticated service with these parts:

1. Identity: one allowed account, with passkey or OAuth login and server-side
   session validation.
2. Write API: validated create, update, rate, review, and list operations.
3. Storage: authored media fields remain separate from synced metadata, matching
   the current `content/library/` versus `data/library.raw.json` split.
4. Publish hook: every accepted edit runs `node tools/library-build.mjs`, validates
   the generated catalogue, and deploys only after tests pass.
5. Audit trail: record the actor, time, and before/after value for every change.

Until that backend exists, authoring stays in `content/library/`, visitors get no
write controls, and the generated `data/library.json` remains read-only.

## Goodreads and Letterboxd

The practical first integration is export import, not live synchronization.

- Goodreads no longer issues new public API keys. Its library export is CSV, so a
  future importer can read Quinn's export and map ISBN, rating, shelves, dates,
  and review text into the authored layer.
- Letterboxd provides an account export bundle of CSV files. It also has an OAuth2
  API, but a production integration needs registered client credentials and secure
  token storage. Start with CSV import, then add OAuth only if automatic refresh is
  worth operating a backend.

Suggested next task: add `tools/library-import-goodreads.mjs` and
`tools/library-import-letterboxd.mjs` using fixture-driven tests and a dry-run
report before either tool writes authored content.
