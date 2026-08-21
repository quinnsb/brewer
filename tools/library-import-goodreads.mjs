import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv, goodreadsItems } from "./lib/csv.mjs";

const input = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
if (!input) throw new Error("Usage: node tools/library-import-goodreads.mjs path/to/goodreads_library_export.csv [--write]");
const items = goodreadsItems(parseCsv(await readFile(path.resolve(input), "utf8")));
const payload = { importedAt: new Date().toISOString(), source: "goodreads-export", items };
if (process.argv.includes("--write")) {
  const output = path.resolve(import.meta.dirname, "../data/library-imports-goodreads.json");
  await writeFile(output, JSON.stringify(payload, null, 2));
  console.log(`${items.length} books -> ${output}`);
} else console.log(JSON.stringify(payload, null, 2));
