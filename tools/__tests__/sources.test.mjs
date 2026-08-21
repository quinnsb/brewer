import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coverHostAllowed, upgradeArtwork, yearOf, withRetry,
  bookCandidates, albumCandidates, filmCandidates, podcastCandidates,
} from "../../api/lib/sources.mjs";

/* The proxy fetches whatever URL it is handed, so the allowlist is the only
   thing standing between /api/cover and a request to link-local metadata. */
test("the cover allowlist accepts the catalogue hosts", () => {
  for (const url of [
    "https://covers.openlibrary.org/b/id/123-L.jpg",
    "https://is1-ssl.mzstatic.com/image/thumb/x/1000x1000bb.jpg",
    "https://is5-ssl.mzstatic.com/image/thumb/x/1000x1000bb.jpg",
    "https://coverartarchive.org/release/abc/front.jpg",
    "https://upload.wikimedia.org/wikipedia/en/a/b.jpg",
    "https://i.gr-assets.com/images/S/x/7235533.jpg",
    "https://a.ltrbxd.com/resized/film-poster/1/2/3-0-1000-0-1500-crop.jpg",
  ]) assert.equal(coverHostAllowed(url), true, url);
});

test("the cover allowlist refuses everything else", () => {
  for (const url of [
    "http://covers.openlibrary.org/b/id/1.jpg",
    "https://169.254.169.254/latest/meta-data/",
    "http://169.254.169.254/latest/meta-data/",
    "https://localhost/secret",
    "https://evil.com/x.jpg",
    "https://covers.openlibrary.org.evil.com/x.jpg",
    "https://gr-assets.com.evil.net/x.jpg",
    "https://notltrbxd.com/x.jpg",
    "file:///etc/passwd",
    "not a url",
    "",
    null,
  ]) assert.equal(coverHostAllowed(url), false, String(url));
});

test("a lookalike subdomain suffix cannot sneak past", () => {
  assert.equal(coverHostAllowed("https://notmzstatic.com/x.jpg"), false);
  assert.equal(coverHostAllowed("https://x.mzstatic.com.attacker.net/x.jpg"), false);
});

test("artwork upgrades to full size", () => {
  assert.equal(
    upgradeArtwork("https://is1-ssl.mzstatic.com/image/thumb/a/100x100bb.jpg"),
    "https://is1-ssl.mzstatic.com/image/thumb/a/1000x1000bb.jpg"
  );
  assert.equal(upgradeArtwork("https://x/no-size.jpg"), "https://x/no-size.jpg");
  assert.equal(upgradeArtwork(null), null);
});

test("yearOf pulls a year out of a date or gives null", () => {
  assert.equal(yearOf("2016-05-13T07:00:00Z"), 2016);
  assert.equal(yearOf(1969), 1969);
  assert.equal(yearOf(""), null);
  assert.equal(yearOf(undefined), null);
  assert.equal(yearOf("not a date"), null);
});

test("books without a cover are dropped rather than shown blank", () => {
  const out = bookCandidates({ docs: [
    { title: "Has cover", cover_i: 1, author_name: ["A"], key: "/works/OL1W" },
    { title: "No cover", author_name: ["B"], key: "/works/OL2W" },
  ] });
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Has cover");
});

test("a book candidate is shaped like a synced book", () => {
  const [book] = bookCandidates({ docs: [{
    title: "The Left Hand of Darkness", cover_i: 99, author_name: ["Ursula K. Le Guin"],
    first_publish_year: 1969, number_of_pages_median: 304, publisher: ["Harper & Row"], key: "/works/OL59800W",
  }] });
  assert.equal(book.type, "book");
  assert.equal(book.creator, "Ursula K. Le Guin");
  assert.equal(book.year, 1969);
  assert.equal(book.detail, "304 pages");
  assert.equal(book.sourceUrl, "https://openlibrary.org/works/OL59800W");
  assert.deepEqual(book.facts, [
    ["Author", "Ursula K. Le Guin"], ["First published", 1969],
    ["Pages", 304], ["Publisher", "Harper & Row"],
  ]);
});

test("facts never carry a null value through", () => {
  const [album] = albumCandidates({ results: [{ collectionName: "X", artworkUrl100: "https://a/100x100bb.jpg" }] });
  for (const [, value] of album.facts) assert.notEqual(value, null);
  const [film] = filmCandidates({ results: [{ trackName: "Y", artworkUrl100: "https://a/100x100bb.jpg" }] });
  for (const [, value] of film.facts) assert.notEqual(value, null);
});

test("a podcast keeps its catalogId, which is how listening data is matched", () => {
  const [pod] = podcastCandidates({ results: [{
    collectionName: "99% Invisible", artistName: "Roman Mars", artworkUrl100: "https://a/100x100bb.jpg",
    collectionId: 394775318, trackCount: 826,
  }] });
  assert.equal(pod.catalogId, 394775318);
  assert.equal(pod.detail, "826 tracks");
  assert.equal(pod.type, "other");
});

test("empty payloads give an empty list rather than throwing", () => {
  assert.deepEqual(bookCandidates({}), []);
  assert.deepEqual(albumCandidates({}), []);
  assert.deepEqual(filmCandidates({}), []);
  assert.deepEqual(podcastCandidates({}), []);
});

/* Open Library resets connections often enough that a single attempt fails
   regularly, which is why sync retries and why the admin must too. */
test("a flaky call succeeds on a later attempt", async () => {
  let calls = 0;
  const value = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error("read ECONNRESET");
      return "ok";
    },
    { sleep: async () => {} }
  );
  assert.equal(value, "ok");
  assert.equal(calls, 3);
});

test("retries give up and surface the last error rather than hanging on", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => { calls += 1; throw new Error(`attempt ${calls}`); }, { sleep: async () => {} }),
    /attempt 3/
  );
  assert.equal(calls, 3);
});

test("a permanent failure is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls += 1;
        const err = new Error("openlibrary.org returned 400");
        err.permanent = true;
        throw err;
      },
      { sleep: async () => {} }
    ),
    /returned 400/
  );
  assert.equal(calls, 1, "a bad query should not be asked three times");
});

test("backoff grows, and the caller never waits on a real timer in tests", async () => {
  const waits = [];
  await assert.rejects(
    withRetry(async () => { throw new Error("nope"); }, { delay: 100, sleep: async (ms) => waits.push(ms) })
  );
  assert.deepEqual(waits, [100, 200]);
});
