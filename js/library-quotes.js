/* ============================================================
   LIBRARY HERO QUOTES

   The hero used to run "You are what you [read / listen to / watch / ...]",
   cycling one word in a fixed slot. This puts a whole quotation there instead,
   picked at random per visit, and reuses the same per-character mask reveal
   the verb swap used so the hero still moves the way the rest of the page does.

   Two differences from the verb slot, both forced by the content:

   A verb is one word on one line, so the old markup could absolutely-position
   it in a reserved box. A quotation wraps, so each word is its own inline-block
   and the characters inside it are what get masked. Wrapping happens between
   words the way it normally does; the mask only ever clips a single glyph.

   And it does not cycle. A verb rotating every 2.2s is a texture you read
   once; a quotation swapping under you while you are half way through it is
   just rude. One per visit, revealed once. If it should cycle later, mount()
   is already re-entrant: call it again with another quote.
   ============================================================ */

const QUOTES_URL = "data/library-quotes.json?v=library-detail9";

const REDUCED =
  matchMedia("(prefers-reduced-motion: reduce)").matches ||
  new URLSearchParams(location.search).get("motion") === "reduce";

/* Per character, matching rotateVerb's cadence so the two read as one system.
   A quotation is far longer than a verb, though, and 24ms per glyph over 60
   characters is a second and a half of type crawling in. The stagger is
   therefore a budget divided by the length rather than a fixed step: short
   lines keep the original snap, long ones compress instead of dragging. */
const STAGGER_BUDGET = 620;
const STAGGER_MAX = 26;

function staggerFor(length) {
  return Math.min(STAGGER_MAX, STAGGER_BUDGET / Math.max(length, 1));
}

/* One word, one inline-block, so the line breaks between words and not inside
   the masks. The trailing space is a real character in its own mask: putting it
   outside would let the browser collapse it at a line end and run words
   together. */
function buildWord(word, startIndex) {
  const node = document.createElement("span");
  node.className = "quote-word";
  let i = startIndex;
  for (const character of word) {
    const mask = document.createElement("span");
    mask.className = "mask";
    const glyph = document.createElement("span");
    glyph.className = "ch enter";
    glyph.textContent = character;
    glyph.dataset.i = String(i);
    i += 1;
    mask.append(glyph);
    node.append(mask);
  }
  return { node, next: i };
}

function build(text) {
  const fragment = document.createDocumentFragment();
  const words = text.split(" ");
  let index = 0;
  words.forEach((word, position) => {
    const built = buildWord(word, index);
    index = built.next;
    fragment.append(built.node);
    /* A space between words, and none after the last one. */
    if (position < words.length - 1) {
      fragment.append(document.createTextNode(" "));
      index += 1;
    }
  });
  return { fragment, count: index };
}

/* Fisher-Yates would be overkill for picking one. Math.random is fine here:
   this is decoration, and a repeat on two consecutive visits costs nothing. */
function pick(quotes, avoid) {
  const pool = quotes.length > 1 && avoid
    ? quotes.filter((quote) => quote.text !== avoid)
    : quotes;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* Screen readers get the sentence and the attribution as text. The
   per-character spans are hidden from them, for the same reason the verb slot
   hid its own: read aloud, they are a stream of letters. */
function mount(host, quote, { animate = true } = {}) {
  const line = host.querySelector("[data-quote-line]");
  const cite = host.querySelector("[data-quote-cite]");
  const sr = host.querySelector("[data-quote-sr]");
  if (!line) return;

  const { fragment, count } = build(quote.text);
  line.replaceChildren(fragment);
  if (cite) cite.textContent = quote.author;
  if (sr) {
    sr.textContent = quote.author
      ? `${quote.text} ${quote.author}`
      : quote.text;
  }

  const glyphs = line.querySelectorAll(".ch");
  if (!animate || REDUCED) {
    glyphs.forEach((glyph) => glyph.classList.remove("enter"));
    host.classList.add("is-in");
    return;
  }

  const step = staggerFor(count);
  requestAnimationFrame(() => {
    host.classList.add("is-in");
    glyphs.forEach((glyph) => {
      const at = Number(glyph.dataset.i) * step;
      setTimeout(() => glyph.classList.remove("enter"), at);
    });
  });
}

async function load() {
  const response = await fetch(QUOTES_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`quotes ${response.status}`);
  const data = await response.json();
  const quotes = (data.quotes || []).filter((quote) => quote?.text);
  if (!quotes.length) throw new Error("quotes file has no usable entries");
  return quotes;
}

/* Returns a reveal function rather than revealing straight away, because the
   hero paints the ring first and type that arrives before the cards have
   landed is type nobody is looking at. The quote is built and sitting in the
   DOM by then, so the reveal is only a class and a stack of timeouts.

   The fetch failing must not cost the hero. The heading beside it is static
   markup and stands on its own, so a missing quotes file leaves a hero with no
   quotation rather than a hero with a hole in it. */
export async function initQuotes(hostSelector = "#hero-quote") {
  const host = document.querySelector(hostSelector);
  if (!host) return () => {};
  if (host.dataset.quotesInitialized === "true") return () => {};
  host.dataset.quotesInitialized = "true";

  let quotes;
  try {
    quotes = await load();
  } catch (error) {
    console.warn("Hero quotes unavailable:", error.message);
    host.hidden = true;
    return () => {};
  }

  let current = pick(quotes);

  /* Built now, held back. The characters are in the DOM with .enter on them,
     which is off-screen inside its own mask, so nothing is visible yet. */
  mount(host, current, { animate: false });
  host.querySelectorAll(".ch").forEach((glyph) => glyph.classList.add("enter"));
  host.classList.remove("is-in");

  return function reveal(next) {
    if (next) current = pick(quotes, current.text);
    mount(host, current);
    return current;
  };
}
