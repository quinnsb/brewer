# Library integrations

The public library stays static and read-only. Account data is imported at build time so visitors never receive private credentials and cannot write ratings on Quinn's behalf.

## Goodreads

Goodreads stopped issuing public API keys in 2020. The supported pipeline uses the CSV from Goodreads' Export Library screen:

```sh
node tools/library-import-goodreads.mjs /path/to/goodreads_library_export.csv --write
node tools/library-sync.mjs
node tools/library-build.mjs
```

The importer keeps title, author, publication year, date read, Quinn's rating, and any custom Goodreads shelves that can serve as genres. Running without `--write` is a dry run that prints the normalized result.

## Letterboxd

Letterboxd API access is request-only and its published policy excludes private or personal projects. Use the account export bundle from Letterboxd Settings instead:

```sh
node tools/library-import-letterboxd.mjs /path/to/letterboxd-export --write
node tools/library-sync.mjs
node tools/library-build.mjs
```

The importer reads `watched.csv` and joins `ratings.csv` when it is present. It keeps title, year, date watched, rating, and the Letterboxd source URL. Film genres are resolved from Wikidata during sync. Running without `--write` is a dry run.

The generated import files are read automatically by `library-sync.mjs`. Imported items are added without replacing the curated baseline. The normal build still applies authored taxonomy and review overrides.

## Album listening

Album metadata now includes Apple catalog identifiers, an Apple Music embed URL, and an ordered tracklist. The fullscreen album view renders the official Apple Music player in the page and lists each track with its duration. Albums missing from the US Apple catalog keep their cover and metadata but do not show a broken player.

Full MusicKit playback or a Spotify player would require a developer token and user authorization. No credential belongs in the static site.

## IMDb ratings

IMDb ratings are supported by the catalog sort field as `externalRating`, but this repository does not invent or scrape them. Connecting that field requires an approved source such as IMDb's licensed API or a separately authorized provider.
