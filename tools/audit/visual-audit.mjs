/* ============================================================
   VISUAL AUDIT — drive a real Chromium over every page and report

   Run:  node tools/audit/visual-audit.mjs [baseUrl]

   Needs Playwright, which the site itself does not: install it where you like
   and point NODE_PATH at it, or `npm i -D playwright && npx playwright install
   chromium` if you would rather it live here. Screenshots land in
   tools/audit/shots, which is gitignored.

   Loads each page in the sitemap at phone, tablet, and desktop sizes and
   records the things a person notices before they can name them: a page that
   scrolls sideways, a heading whose words are cut off, a button that cannot be
   tapped because something invisible is lying on top of it. Writes findings to
   stdout as JSON and drops a screenshot per page per size.

   The point of the hit test is that "the button exists" and "the button can be
   pressed" are different claims, and only the second one matters.
   ============================================================ */

import { chromium, devices } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:4180";
const SHOTS = path.resolve(import.meta.dirname, "shots");

const PAGES = [
  "/", "/about.html", "/work.html", "/contact.html", "/library.html",
  "/library-lists.html", "/privacy.html", "/blog.html", "/404.html",
  "/projects/ms-consulting.html", "/projects/collegiate-church-network.html",
  "/projects/the-forgotten-initiative.html", "/projects/atlas-ivy.html",
  "/projects/foxglove.html", "/projects/homefield.html", "/projects/nix.html",
  "/projects/rally.html", "/projects/ridgeline.html",
];

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "tablet", width: 820, height: 1180, mobile: false },
  { name: "desktop", width: 1440, height: 900, mobile: false },
];

/* Runs in the page. Everything here is a measurement, not a judgement. */
function collect() {
  const out = { overflow: null, clipped: [], offscreen: [], smallTaps: [], covered: [] };
  const vw = window.innerWidth;

  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) {
    out.overflow = { scrollWidth: de.scrollWidth, viewport: vw };
    /* name the widest offenders so the fix has an address */
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 && getComputedStyle(el).position !== "fixed") {
        out.offscreen.push({ sel: label(el), right: Math.round(r.right), width: Math.round(r.width) });
      }
    }
    out.offscreen.sort((a, b) => b.right - a.right);
    out.offscreen = out.offscreen.slice(0, 8);
  }

  /* text cut off by its own box */
  for (const el of document.querySelectorAll("h1,h2,h3,h4,p,li,a,span,button,figcaption,td,th")) {
    const cs = getComputedStyle(el);
    if (cs.overflow === "visible" && cs.overflowY === "visible") continue;
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0) continue;
    const cutY = el.scrollHeight - el.clientHeight > 2 && cs.overflowY !== "auto" && cs.overflowY !== "scroll";
    const cutX = el.scrollWidth - el.clientWidth > 2 && cs.overflowX !== "auto" && cs.overflowX !== "scroll";
    if (cutY || cutX) {
      out.clipped.push({
        sel: label(el),
        text: (el.textContent || "").trim().slice(0, 60),
        lostY: el.scrollHeight - el.clientHeight,
        lostX: el.scrollWidth - el.clientWidth,
      });
    }
  }
  out.clipped = out.clipped.slice(0, 12);

  /* interactive things too small to hit, and interactive things something else covers */
  for (const el of document.querySelectorAll("a,button,[role=button],input,select")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.pointerEvents === "none" || Number(cs.opacity) === 0) continue;
    const onscreen = r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= vw;
    if (!onscreen) continue;
    if (r.width < 24 || r.height < 24) {
      out.smallTaps.push({ sel: label(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
      out.covered.push({ sel: label(el), blockedBy: label(hit), z: getComputedStyle(hit).zIndex });
    }
  }
  out.smallTaps = out.smallTaps.slice(0, 10);
  out.covered = out.covered.slice(0, 10);
  return out;

  function label(el) {
    if (!el || !el.tagName) return "?";
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    if (el.className && typeof el.className === "string") {
      s += "." + el.className.trim().split(/\s+/).slice(0, 3).join(".");
    }
    return s;
  }
}

/* Does the Menu control actually open the menu? */
async function testMenu(page) {
  const bar = page.locator(".menu-bar .menu-btn");
  const pill = page.locator(".menu-btn").first();
  const trigger = (await bar.count()) && (await bar.isVisible()) ? bar : pill;
  if (!(await trigger.count())) return { present: false };
  const visible = await trigger.isVisible();
  if (!visible) return { present: true, visible: false };

  const wired = await page.evaluate(() => {
    /* a page that never loads the menu script has a button with nothing behind it */
    return [...document.scripts].some((s) => (s.src || "").includes("site-menu"));
  });

  let opened = false, dockClickable = null, err = null;
  try {
    await trigger.click({ timeout: 2500 });
    await page.waitForTimeout(700);
    opened = await page.evaluate(() => document.body.classList.contains("menu-open"));
    if (opened) {
      dockClickable = await page.evaluate(() => {
        const a = document.querySelector(".menu-dock a");
        if (!a) return "no links";
        const r = a.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit === a || a.contains(hit) ? "yes" : `blocked by ${hit && hit.tagName}.${hit && hit.className}`;
      });
      await page.evaluate(() => document.querySelector(".menu-close")?.click());
      await page.waitForTimeout(800);
    }
  } catch (e) {
    err = e.message.split("\n")[0];
  }
  const closed = await page.evaluate(() => !document.body.classList.contains("menu-open"));
  return { present: true, visible: true, scriptLoaded: wired, opened, closed, dockClickable, err };
}

const browser = await chromium.launch();
const findings = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext(
    vp.mobile
      ? { ...devices["iPhone 14 Pro"] }
      : { viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 }
  );
  const page = await ctx.newPage();

  for (const url of PAGES) {
    const console_ = [];
    const netfail = [];
    page.on("console", (m) => { if (m.type() === "error") console_.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => console_.push("pageerror: " + e.message.slice(0, 200)));
    page.on("requestfailed", (r) => netfail.push(`${r.failure()?.errorText} ${r.url().slice(0, 120)}`));
    page.on("response", (r) => { if (r.status() >= 400) netfail.push(`${r.status()} ${r.url().slice(0, 120)}`); });

    let load = "ok";
    try {
      await page.goto(BASE + url, { waitUntil: "load", timeout: 25000 });
      await page.waitForTimeout(1200);
    } catch (e) {
      load = e.message.split("\n")[0];
    }

    const measured = load === "ok" ? await page.evaluate(collect) : {};
    const menu = load === "ok" ? await testMenu(page) : {};

    const shot = path.join(SHOTS, `${vp.name}${url.replace(/[/.]/g, "_") || "_home"}.png`);
    if (load === "ok") {
      try { await page.screenshot({ path: shot }); } catch {}
    }

    findings.push({ url, viewport: vp.name, load, console: console_.slice(0, 6), netfail: [...new Set(netfail)].slice(0, 6), menu, ...measured });
    page.removeAllListeners();
  }
  await ctx.close();
}

await browser.close();
await mkdir(SHOTS, { recursive: true });
await writeFile(path.join(SHOTS, "findings.json"), JSON.stringify(findings, null, 2));
console.log(JSON.stringify(findings, null, 2));
