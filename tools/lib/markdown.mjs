/* Deliberately tiny. Paragraphs, emphasis, links. Anything more and the
   answer is a real parser, not more regexes.

   Escaping happens FIRST, on the raw text, so review copy can never inject
   markup. The inline rules below then re-introduce only the tags we chose. */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escape = (s) => s.replace(/[&<>"]/g, (c) => ESCAPES[c]);

function inline(text) {
  return text
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function renderMarkdown(md) {
  const trimmed = md.trim();
  if (!trimmed) return "";
  return escape(trimmed)
    .split(/\r?\n\s*\r?\n/)
    .map((block) => `<p>${inline(block.replace(/\r?\n/g, " ").trim())}</p>`)
    .join("");
}
