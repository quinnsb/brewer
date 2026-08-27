import { test } from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { libraryPlaylist } from "../../js/library-playlist.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

test("every playlist source is a deploy-safe ASCII path", () => {
  for (const track of libraryPlaylist) {
    assert.match(
      track.src,
      /^[\x20-\x7E]+$/,
      `${track.title} uses a Unicode filename that may be normalized differently in production`
    );
  }
});

test("every playlist source exists", async () => {
  await Promise.all(
    libraryPlaylist.map((track) => access(path.join(ROOT, track.src)))
  );
});
