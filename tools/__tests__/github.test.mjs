import { test } from "node:test";
import assert from "node:assert/strict";
import { commitFiles } from "../../api/lib/github.mjs";

/* A fake GitHub that records what it was asked to do, so the commit sequence
   can be asserted without touching the network or the real repo. */
function fakeGitHub({ failOn } = {}) {
  const calls = [];
  return {
    calls,
    async fetch(url, options = {}) {
      const method = options.method || "GET";
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ url, method, body });
      if (failOn && url.includes(failOn)) {
        return { ok: false, status: 422, async text() { return "boom"; } };
      }
      const reply = (data) => ({ ok: true, status: 200, async json() { return data; } });
      if (url.includes("/git/ref/")) return reply({ object: { sha: "REF_SHA" } });
      if (url.includes("/git/commits/REF_SHA")) return reply({ tree: { sha: "BASE_TREE" } });
      if (url.endsWith("/git/blobs")) return reply({ sha: `BLOB_${calls.length}` });
      if (url.endsWith("/git/trees")) return reply({ sha: "NEW_TREE" });
      if (url.endsWith("/git/commits")) return reply({ sha: "NEW_COMMIT" });
      if (url.includes("/git/refs/")) return reply({ object: { sha: "NEW_COMMIT" } });
      throw new Error(`unexpected url ${url}`);
    },
  };
}

const FILES = [
  { path: "content/library/book-x.md", content: "hello" },
  { path: "data/library.json", content: "{}" },
];

test("commits every file in a single commit", async () => {
  const gh = fakeGitHub();
  const sha = await commitFiles(FILES, "a message", { repo: "quinnsb/brewer", token: "t", fetch: gh.fetch });

  assert.equal(sha, "NEW_COMMIT");
  const trees = gh.calls.filter((c) => c.url.endsWith("/git/trees"));
  assert.equal(trees.length, 1, "one tree means one commit, not one commit per file");
  assert.equal(trees[0].body.tree.length, 2);
  assert.equal(trees[0].body.base_tree, "BASE_TREE");
});

test("blobs are uploaded base64 so binary covers survive", async () => {
  const gh = fakeGitHub();
  await commitFiles([{ path: "images/library/x.jpg", content: Buffer.from([0xff, 0xd8, 0xff]) }], "m", {
    repo: "quinnsb/brewer", token: "t", fetch: gh.fetch,
  });
  const blob = gh.calls.find((c) => c.url.endsWith("/git/blobs"));
  assert.equal(blob.body.encoding, "base64");
  assert.equal(Buffer.from(blob.body.content, "base64")[0], 0xff);
});

test("the token is sent and never placed in the url", async () => {
  const gh = fakeGitHub();
  await commitFiles(FILES, "m", { repo: "quinnsb/brewer", token: "secret-token", fetch: gh.fetch });
  for (const call of gh.calls) {
    assert.doesNotMatch(call.url, /secret-token/, "token must not leak into a url");
  }
});

test("files are committed with mode 100644 and blob type", async () => {
  const gh = fakeGitHub();
  await commitFiles(FILES, "m", { repo: "quinnsb/brewer", token: "t", fetch: gh.fetch });
  const tree = gh.calls.find((c) => c.url.endsWith("/git/trees")).body.tree;
  for (const entry of tree) {
    assert.equal(entry.mode, "100644");
    assert.equal(entry.type, "blob");
  }
});

test("a failed call reports the step that failed instead of a bare status", async () => {
  const gh = fakeGitHub({ failOn: "/git/trees" });
  await assert.rejects(
    () => commitFiles(FILES, "m", { repo: "quinnsb/brewer", token: "t", fetch: gh.fetch }),
    /tree/i
  );
});

test("committing nothing is refused rather than making an empty commit", async () => {
  const gh = fakeGitHub();
  await assert.rejects(
    () => commitFiles([], "m", { repo: "quinnsb/brewer", token: "t", fetch: gh.fetch }),
    /no files/i
  );
  assert.equal(gh.calls.length, 0);
});
