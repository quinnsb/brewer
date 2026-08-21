/* ============================================================
   GITHUB — commit a set of files as one commit

   The contents API writes one file per commit, and a saved note plus the
   regenerated data have to land together or the site serves a note that its
   data does not know about. So this walks the git plumbing instead:

     ref -> base commit -> blobs -> tree -> commit -> move ref

   The token is a fine-grained PAT with contents read/write on this repository
   and nothing else. It travels in a header, never in a URL, because URLs end up
   in logs.
   ============================================================ */

const API = "https://api.github.com";

async function call(fetchImpl, token, url, options = {}) {
  const response = await fetchImpl(url, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "brewer-admin",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`GitHub ${options.step || "request"} failed (${response.status}): ${detail.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function commitFiles(files, message, { repo, token, branch = "main", fetch: fetchImpl = fetch } = {}) {
  if (!files?.length) throw new Error("Refusing to commit: no files given");
  if (!repo || !token) throw new Error("Refusing to commit: repo and token are both required");

  const base = `${API}/repos/${repo}`;
  const go = (url, options) => call(fetchImpl, token, url, options);

  const ref = await go(`${base}/git/ref/heads/${branch}`, { step: "ref read" });
  const parent = ref.object.sha;
  const head = await go(`${base}/git/commits/${parent}`, { step: "commit read" });

  const tree = [];
  for (const file of files) {
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content), "utf8");
    const blob = await go(`${base}/git/blobs`, {
      method: "POST",
      step: "blob write",
      body: JSON.stringify({ content: content.toString("base64"), encoding: "base64" }),
    });
    tree.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const newTree = await go(`${base}/git/trees`, {
    method: "POST",
    step: "tree write",
    body: JSON.stringify({ base_tree: head.tree.sha, tree }),
  });

  const commit = await go(`${base}/git/commits`, {
    method: "POST",
    step: "commit write",
    body: JSON.stringify({ message, tree: newTree.sha, parents: [parent] }),
  });

  /* Not forced. If something else moved the branch since the ref read, this
     fails and the save is reported as failed, which is the correct outcome. */
  await go(`${base}/git/refs/heads/${branch}`, {
    method: "PATCH",
    step: "ref update",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return commit.sha;
}

/* Reading a single file. Returns null for a file that does not exist yet, since
   a note that has never been written is the normal case, not an error. */
export async function readFile(path, { repo, token, branch = "main", fetch: fetchImpl = fetch } = {}) {
  const url = `${API}/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`;
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "brewer-admin",
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub read failed (${response.status}) for ${path}`);
  const data = await response.json();
  return Buffer.from(data.content, "base64").toString("utf8");
}
