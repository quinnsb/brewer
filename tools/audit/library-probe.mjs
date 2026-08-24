/* ============================================================
   LIBRARY PROBE — the interactions the page-level audit cannot reach

   Run:  node tools/audit/library-probe.mjs [baseUrl]

   Needs Playwright, which the site itself does not: install it where you like
   and point NODE_PATH at it, or `npm i -D playwright && npx playwright install
   chromium` if you would rather it live here. Screenshots land in
   tools/audit/shots, which is gitignored.

   The visual audit only ever sees a page at rest with nothing open. Most of
   what goes wrong on the library page goes wrong after a tap: a detail panel
   whose See-also covers stretch to five times their width, a shelf that jumps
   when a fast swipe outruns the snap. This opens those states and measures
   them.
   ============================================================ */

import { chromium, devices } from "playwright";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:4180";
const SHOTS = path.resolve(import.meta.dirname, "shots");
const browser = await chromium.launch();

for (const kind of ["phone", "desktop"]) {
  const ctx = await browser.newContext(
    kind === "phone" ? { ...devices["iPhone 14 Pro"] } : { viewport: { width: 1440, height: 900 } }
  );
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message.split("\n")[0]));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });

  await page.goto(`${BASE}/library.html`, { waitUntil: "load" });
  await page.waitForTimeout(4200); /* let the hero choreography finish */

  console.log(`\n================ ${kind} ================`);

  /* ---------- hero headline: is the whole sentence ever on screen? ---------- */
  const verbSamples = [];
  for (let i = 0; i < 30; i++) {
    verbSamples.push(await page.evaluate(() => {
      const slot = document.getElementById("verb-slot");
      const r = slot?.getBoundingClientRect();
      return {
        text: (slot?.textContent || "").trim(),
        visible: [...(slot?.querySelectorAll(".ch") || [])].filter(
          (c) => !c.classList.contains("enter") && !c.classList.contains("leave")
        ).length,
        h: Math.round(r?.height || 0),
      };
    }));
    await page.waitForTimeout(120);
  }
  const blank = verbSamples.filter((s) => s.visible === 0).length;
  console.log(`HERO VERB: ${blank}/${verbSamples.length} samples showed no verb at all ` +
    `(slot height ${verbSamples[0].h}px). Sentence is incomplete ${Math.round((blank / verbSamples.length) * 100)}% of the time.`);

  /* ---------- the film shelf under a fast swipe ---------- */
  const shelfInfo = await page.evaluate(() => {
    const shelves = [...document.querySelectorAll("[data-shelf], .shelf-rail, .shelf-track, .shelf")];
    return shelves.slice(0, 12).map((s) => ({
      sel: s.className, tag: s.tagName, id: s.id,
      scrollW: s.scrollWidth, clientW: s.clientWidth,
      overflowX: getComputedStyle(s).overflowX,
      snapType: getComputedStyle(s).scrollSnapType,
      behavior: getComputedStyle(s).scrollBehavior,
      overscroll: getComputedStyle(s).overscrollBehaviorX,
    }));
  });
  console.log("SHELVES:", JSON.stringify(shelfInfo, null, 1));

  /* ---------- open a film detail and measure the See-also covers ---------- */
  const opened = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll("[data-id]")].find((b) => (b.dataset.id || "").startsWith("film-"));
    if (!btn) return "no film card found";
    btn.click();
    return btn.dataset.id;
  });
  await page.waitForTimeout(1800);
  console.log("OPENED:", opened);

  const detail = await page.evaluate(() => {
    const panel = document.querySelector(".media-detail, [class*=media-detail]");
    const row = document.querySelector(".media-detail-related-row");
    const items = [...document.querySelectorAll(".media-detail-related-item")];
    return {
      panelOpen: !!panel,
      rowCols: row ? getComputedStyle(row).gridTemplateColumns : null,
      items: items.map((b) => {
        const img = b.querySelector("img");
        const pic = b.querySelector("picture");
        const rb = b.getBoundingClientRect();
        const ri = img?.getBoundingClientRect();
        const cs = img ? getComputedStyle(img) : null;
        return {
          btnW: Math.round(rb.width), btnH: Math.round(rb.height),
          imgW: Math.round(ri?.width || 0), imgH: Math.round(ri?.height || 0),
          ratio: ri && ri.width ? +(ri.height / ri.width).toFixed(2) : null,
          natural: img ? `${img.naturalWidth}x${img.naturalHeight}` : null,
          cssWidth: cs?.width, cssAspect: cs?.aspectRatio, cssHeight: cs?.height,
          pictureDisplay: pic ? getComputedStyle(pic).display : "NO PICTURE",
          pictureW: pic ? Math.round(pic.getBoundingClientRect().width) : null,
        };
      }),
    };
  });
  console.log("SEE ALSO:", JSON.stringify(detail, null, 1));

  await page.screenshot({ path: path.join(SHOTS, `probe-${kind}-detail-top.png`) });
  await page.evaluate(() => {
    document.querySelector(".media-detail-related")?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, `probe-${kind}-seealso.png`) });

  /* ---------- the brand marks ---------- */
  const marks = await page.evaluate(() => {
    return [...document.querySelectorAll(".media-detail svg path, [class*=source] svg path, a svg path")]
      .slice(0, 12)
      .map((p) => {
        const svg = p.ownerSVGElement;
        let box = null;
        try { box = p.getBBox(); } catch {}
        return {
          label: (svg?.closest("a,button")?.textContent || "").trim().slice(0, 24),
          subpaths: (p.getAttribute("d") || "").split(/(?=M)/).length,
          bbox: box ? `${box.x.toFixed(1)},${box.y.toFixed(1)} ${box.width.toFixed(1)}x${box.height.toFixed(1)}` : "none",
        };
      });
  });
  console.log("BRAND MARKS:", JSON.stringify(marks, null, 1));

  if (errs.length) console.log("ERRORS:", [...new Set(errs)].slice(0, 8));
  await ctx.close();
}

await browser.close();
