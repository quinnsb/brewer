/* Minimal YAML-subset frontmatter. Flat `key: value` pairs only, which is
   all the review files need. No nesting, no lists, no anchors. */

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function coerce(raw) {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v !== "" && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

export function parseFrontmatter(text) {
  const match = FENCE.exec(text);
  if (!match) return { data: {}, body: text.trim() };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    /* split on the FIRST colon only, so values may contain colons */
    data[line.slice(0, idx).trim()] = coerce(line.slice(idx + 1));
  }
  return { data, body: text.slice(match[0].length).trim() };
}
