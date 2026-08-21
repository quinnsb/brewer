# Library admin portal

Date: 2026-08-21
Status: approved, building

## What this is

A logged-in `quinnbrewer.com/admin` where Quinn can rate and write up library
items, add new ones, pull recent reading and watching from Goodreads and
Letterboxd, and build the curated lists the library pages promise.

Analytics was considered and dropped.

## Constraints found while scoping

**The site has no build step and no npm dependencies.** There is no
`package.json` anywhere in the repo. Everything under `tools/` runs on node
builtins alone. That is worth keeping.

**`sips` is macOS only.** Cover colour is sampled by shelling out to `sips`,
so any build running on Vercel or a GitHub runner, both Linux, cannot sample a
cover. This rules out the obvious design where the admin commits a note and a
server-side build regenerates `data/library.json`.

**The GitHub contents API commits one file at a time.** Saving a note and the
regenerated data as a single atomic commit needs the git trees API instead.

**Lists do not exist as data.** `library-lists.js` renders twelve hardcoded
title strings, the words "List coming later", and a decorative strip of
unrelated covers. There is no membership, no ordering, no model. Building the
list editor means inventing the list model first.

## Architecture

Vercel serves the existing static files unchanged and adds a small number of
functions under `/api`. There is no build step on the server.

The trick that avoids `sips` on Linux: **the function does the merge itself.**
`/api/save` imports the same `mergeItem` the local build uses, produces the
updated item, and commits the note and `data/library.json` together. Cover
colour for a brand new cover is computed in the browser on a canvas, which
reproduces what `sips` does locally, and travels with the save. Nothing on the
server ever needs to decode an image.

The local `node tools/library-build.mjs` stays exactly as it is, and stays the
way to rebuild everything from scratch. The admin is a second, narrower writer
of the same files, not a replacement.

### Auth

- `POST /api/login` compares the submitted password against `ADMIN_PASSWORD`
  with `crypto.timingSafeEqual`, then sets `admin_session`, an HttpOnly, Secure,
  SameSite=Lax cookie holding an expiry signed with HMAC-SHA256 over
  `SESSION_SECRET`.
- Every write function verifies that signature before doing anything.
- The password never reaches the browser and is never stored in the repo. Both
  values live in Vercel environment variables.
- Serverless has no shared memory, so per-IP rate limiting is not reliable
  without adding a store. Instead: a failed login sleeps for 250ms, and the
  password is required to be long and random. This is documented rather than
  pretended away.
- `/admin` itself is a public static page. It holds no secrets, and every write
  is gated server-side, so serving it to a stranger costs nothing.

### Writing to the repo

`lib/github.mjs` wraps the trees API: read the branch ref, create a blob per
file, build a tree, create a commit, move the ref. One call commits many files
atomically. Auth is a fine-grained token, `GITHUB_TOKEN`, with contents
read/write on this one repository and nothing else.

A push triggers a Vercel deploy, so saved work is live within a minute.

## Phase 1: shell and auth

- `admin.html` plus `css/admin.css` and `js/admin/*.js`
- `api/login.mjs`, `api/logout.mjs`, `api/session.mjs`
- `api/lib/session.mjs`, `api/lib/github.mjs`
- Login screen, and a signed-in shell with nothing in it yet

## Phase 2: rate and write

The reason the project exists. 84 items currently have no rating and no writeup.

- Item picker: search and filter the catalog, jump to any item
- Editor: rating in half steps, favourite toggle, finished date, markdown body
  with a live preview using the same `renderMarkdown` the build uses
- `api/note.mjs` reads the current note, `api/save.mjs` writes note plus data
- Unsaved changes warn before navigating away

## Phase 3: add new items

- `api/search.mjs` proxies Open Library, MusicBrainz, and iTunes server-side,
  reusing the query logic in `library-sync.mjs`. Server-side because it dodges
  CORS and keeps the shape of those calls in one place.
- `api/cover.mjs` proxies the chosen cover image so the browser can draw it to a
  canvas same-origin and compute the palette
- Save commits the cover, the raw entry, the note, the palette cache entry, and
  the regenerated data together

## Phase 4: Goodreads and Letterboxd

- `api/import.mjs` fetches the two public feeds server-side and diffs against
  the ids already in the library
  - Goodreads: `goodreads.com/review/list_rss/<userId>?shelf=read`, which
    carries title, author, rating, date read, and cover
  - Letterboxd: `letterboxd.com/<user>/rss/`, recent diary entries only, so the
    CSV export stays the way to backfill history
- Candidates are shown for review. Nothing is written without being accepted,
  because a feed will happily offer a book Quinn abandoned.
- Accepting one runs it through the phase 3 add path
- Feed identities live in `data/library-sources.json`, not in env, since they
  are not secret

## Phase 5: lists

New model at `data/library-lists.json`:

```json
[{ "id": "top-25-books", "type": "book", "title": "My top 25 books",
   "intro": "...", "ranked": true, "items": ["book-piranesi"] }]
```

Site side:

- `listCard` renders real membership: the first covers in the list, a real
  count, and no "List coming later"
- `library-lists.html?list=<id>` renders one list in order, ranked lists
  numbered
- The twelve hardcoded strings in `PAGE.lists` are deleted, and lists come from
  the data file, so adding a list no longer means editing JavaScript

Admin side:

- Create, retitle, write the intro, delete
- Add items by search, remove them, reorder
- Reorder is up and down buttons rather than drag and drop, because buttons are
  keyboard accessible for free and drag and drop is not

## Success criteria

- A wrong password never sets a cookie, and a forged cookie is rejected
- No secret appears in any file served to the browser
- Saving a rating and a writeup produces one commit touching the note and
  `data/library.json`, and the change is live after the deploy
- A newly added item arrives with a correct cover palette, sampled in the
  browser, with no `sips` involved
- Running `node tools/library-build.mjs` locally after any admin save produces
  no diff, so the two writers agree
- An import proposes only items not already in the library, and writes nothing
  until accepted
- A list built in the admin renders on `library-lists.html` in the order set
