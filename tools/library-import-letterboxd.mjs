import { readFile, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { parseCsv, letterboxdItems } from "./lib/csv.mjs";

const input = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
if (!input) throw new Error("Usage: node tools/library-import-letterboxd.mjs path/to/letterboxd-export [--write]");
const resolved = path.resolve(input);
const directory = statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
const watchedPath = statSync(resolved).isDirectory() ? path.join(directory, "watched.csv") : resolved;
const ratingsPath = path.join(directory, "ratings.csv");
const watched = parseCsv(await readFile(watchedPath, "utf8"));
const ratings = existsSync(ratingsPath) ? parseCsv(await readFile(ratingsPath, "utf8")) : [];
const items = letterboxdItems(watched, ratings);
const payload = { importedAt: new Date().toISOString(), source: "letterboxd-export", items };
if (process.argv.includes("--write")) {
  const output = path.resolve(import.meta.dirname, "../data/library-imports-letterboxd.json");
  await writeFile(output, JSON.stringify(payload, null, 2));
  console.log(`${items.length} films -> ${output}`);
} else console.log(JSON.stringify(payload, null, 2));
