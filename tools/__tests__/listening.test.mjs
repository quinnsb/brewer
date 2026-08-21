import { test } from "node:test";
import assert from "node:assert/strict";
import { applyListening } from "../lib/listening.mjs";

test("adds Spotify album and embed URLs to mapped albums", () => {
  const [item] = applyListening(
    [{ id: "album-one", type: "album", title: "One" }],
    { "album-one": "71QyofYesSsRMwFOTafnhB" }
  );
  assert.equal(item.spotifyUrl, "https://open.spotify.com/album/71QyofYesSsRMwFOTafnhB");
  assert.equal(item.spotifyEmbedUrl, "https://open.spotify.com/embed/album/71QyofYesSsRMwFOTafnhB?utm_source=generator");
});

test("rejects unknown catalog ids and malformed Spotify ids", () => {
  assert.throws(
    () => applyListening([{ id: "album-one", type: "album" }], { "album-two": "71QyofYesSsRMwFOTafnhB" }),
    /unknown item ids: album-two/
  );
  assert.throws(
    () => applyListening([{ id: "album-one", type: "album" }], { "album-one": "not-an-id" }),
    /Invalid Spotify album id/
  );
});
