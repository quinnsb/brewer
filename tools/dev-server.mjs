/* ============================================================
   DEV SERVER — static files plus the /api functions

   Run:  node tools/dev-server.mjs [port]

   The site is static and Vercel serves it as such, but the admin needs the
   functions under api/ to exist, and python's http.server cannot run them. This
   is the same routing Vercel does, in about a hundred lines and no dependencies:
   a request to /api/x runs api/x.mjs, anything else is a file.

   Reads .env so ADMIN_PASSWORD and friends work locally the way they do in the
   Vercel project settings.
   ============================================================ */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "./lib/env.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = Number(process.argv[2] || process.env.PORT || 4180);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8", ".gif": "image/gif", ".mp4": "video/mp4",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.end(body);
}

async function serveApi(req, res, route) {
  const file = path.join(ROOT, "api", `${route}.mjs`);
  if (!existsSync(file)) return send(res, 404, `No function at api/${route}.mjs`);
  try {
    /* Cache-busted so editing a function does not need a restart. */
    const module = await import(`${file}?t=${Date.now()}`);
    await module.default(req, res);
  } catch (err) {
    console.error(`  api/${route} threw:`, err);
    if (!res.headersSent) send(res, 500, JSON.stringify({ error: err.message }), "application/json");
    else res.end();
  }
}

async function serveFile(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith("/")) rel += "index.html";
  /* Never let a request climb out of the project. */
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!file.startsWith(ROOT)) return send(res, 403, "Forbidden");

  let target = file;
  if (!existsSync(target) && existsSync(`${target}.html`)) target = `${target}.html`;
  if (!existsSync(target)) return send(res, 404, "Not found");
  if ((await stat(target)).isDirectory()) {
    target = path.join(target, "index.html");
    if (!existsSync(target)) return send(res, 404, "Not found");
  }

  res.setHeader("Cache-Control", "no-store");
  send(res, 200, await readFile(target), TYPES[path.extname(target)] || "application/octet-stream");
}

await loadEnv(ROOT);

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (pathname.startsWith("/api/")) return serveApi(req, res, pathname.slice(5).replace(/\/+$/, ""));
  return serveFile(req, res, pathname);
}).listen(PORT, () => {
  const missing = ["ADMIN_PASSWORD", "SESSION_SECRET", "GITHUB_TOKEN", "GITHUB_REPO"].filter((k) => !process.env[k]);
  console.log(`serving ${ROOT} on http://localhost:${PORT}`);
  console.log(`admin at http://localhost:${PORT}/admin.html`);
  if (missing.length) console.log(`\n  heads up: ${missing.join(", ")} not set, so parts of the admin will refuse to run`);
});
