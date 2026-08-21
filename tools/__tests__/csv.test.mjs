import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, goodreadsItems, letterboxdItems } from "../lib/csv.mjs";

test("parses quoted CSV fields and escaped quotes", () => {
  const rows = parseCsv('Title,Author\n"Book, The","Last, First"\n"Say ""Hi""",Writer\n');
  assert.deepEqual(rows, [
    { Title: "Book, The", Author: "Last, First" },
    { Title: 'Say "Hi"', Author: "Writer" },
  ]);
});

test("normalizes Goodreads books without inventing a rating", () => {
  const [item] = goodreadsItems([{ Title: "Dune", Author: "Frank Herbert", "My Rating": "0", "Year Published": "1965" }]);
  assert.equal(item.query, "Dune Frank Herbert");
  assert.equal(item.rating, null);
  assert.equal(item.year, 1965);
});

test("joins Letterboxd ratings to watched films", () => {
  const [item] = letterboxdItems(
    [{ Date: "2026-08-21", Name: "Moonlight", Year: "2016", "Letterboxd URI": "https://boxd.it/d6bE" }],
    [{ Name: "Moonlight", Year: "2016", Rating: "4.5" }]
  );
  assert.equal(item.rating, 4.5);
  assert.equal(item.finished, "2026-08-21");
});
