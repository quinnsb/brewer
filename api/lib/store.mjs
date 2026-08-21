/* ============================================================
   STORE — where the admin's writes actually go

   In production GITHUB_TOKEN is set and writes become one commit on the repo,
   which Vercel then deploys. Locally the token is usually absent, so writes go
   straight to the working tree instead. That is not a mock: editing local files
   is what you want when you are running the admin on your own machine, and it
   keeps the whole portal usable without minting a token first.
   ============================================================ */

import { readFile as readLocal, writeFile as writeLocal, mkdir } from "node:fs/promises";
import path from "node:path";
import { commitFiles, readFile as readRemote } from "./github.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

export function storeMode() {
  return process.env.GITHUB_TOKEN ? "github" : "local";
}

function remoteOptions() {
  return {
    repo: process.env.GITHUB_REPO,
    token: process.env.GITHUB_TOKEN,
    branch: process.env.GITHUB_BRANCH || "main",
  };
}

export async function readText(file) {
  if (storeMode() === "github") return readRemote(file, remoteOptions());
  try {
    return await readLocal(path.join(ROOT, file), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function readJson(file, fallback = null) {
  const text = await readText(file);
  if (text === null) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

/* files: [{ path, content }] where content is a string or a Buffer. */
export async function writeFiles(files, message) {
  if (storeMode() === "github") {
    if (!process.env.GITHUB_REPO) throw new Error("GITHUB_REPO is not set");
    const sha = await commitFiles(files, message, remoteOptions());
    return { mode: "github", sha };
  }
  for (const file of files) {
    const target = path.join(ROOT, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeLocal(target, Buffer.isBuffer(file.content) ? file.content : String(file.content));
  }
  return { mode: "local", files: files.map((f) => f.path) };
}
