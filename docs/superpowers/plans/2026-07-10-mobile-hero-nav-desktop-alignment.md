# Mobile Hero/Nav Rework + Desktop Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the mobile homepage hero and mobile nav to the Trust Design Shop reference (bigger hero type, full-screen stacked-pill menu, cream bottom chrome bar), and align the desktop homepage's logo, hero text, and Menu button to one shared left edge.

**Architecture:** Static hand-written HTML/CSS site, no build step. All styling changes land in `css/styles.css` (mobile work inside the existing `@media (max-width: 620px)` block or a new one adjacent to it). The mobile bottom bar needs a small markup addition to all 13 HTML pages and a small change in `js/main.js` so both menu triggers open the dock.

**Tech Stack:** Plain HTML/CSS/JS. No test framework — every task is verified in the browser preview (server `static-site` from `.claude/launch.json`, http://localhost:8934) at mobile (375×812) and desktop (1280×800) viewports.

## Global Constraints

- Do not change nav button order or labels: About Me, Work, Let's Talk, Blog, Close.
- Do not touch the word-by-word hero reveal animation logic (`.split`, `home-intro`).
- Mobile changes apply at `max-width: 620px`; desktop (>900px) dock behavior unchanged.
- Colors/fonts come from existing `:root` variables (`--cream`, `--ink`, `--bg`, etc.). No new colors.
- All 13 pages share the fixed chrome: `index.html`, `about.html`, `work.html`, `blog.html`, `contact.html`, `projects/atlas-ivy.html`, `projects/foxglove.html`, `projects/homefield.html`, `projects/nix.html`, `projects/rally.html`, `projects/ridgeline.html`, `projects/project-template.html`.
- Verification is visual: use the browser preview tools (resize_window, screenshot, read_page), never ask the user to check manually.

---

### Task 1: Desktop left-edge alignment

**Files:**
- Modify: `css/styles.css:96-97` (`:root` vars), `css/styles.css:202-205` (`.site-logo`), `css/styles.css:248-251` (`.menu-btn`)

**Interfaces:**
- Produces: `--page-edge` custom property on `:root`, consumed by later tasks (Task 3 bottom bar uses it for side insets on desktop-check only; mobile uses fixed px).

- [ ] **Step 1: Add the shared edge variable and point the rail at it**

In `css/styles.css` `:root`, after the `--home-rail` line, add `--page-edge` and redefine `--home-rail` to use it:

```css
  --page-edge: clamp(30px, 3.2vw, 62px);
  --home-rail: var(--page-edge);
```

(Replace the existing `--home-rail: clamp(4.75rem, 6.5vw, 7.5rem);` line — the testimonial section at `css/styles.css:669` also uses `--home-rail`, and should follow the new edge so the homepage stays internally aligned.)

- [ ] **Step 2: Align the fixed chrome to the same edge**

Change `.site-logo` (line ~204) from `left: 34px;` to:

```css
  left: var(--page-edge);
```

Change `.menu-btn` (line ~251) from `left: 34px;` to:

```css
  left: var(--page-edge);
```

Leave the `top: 34px` / `bottom: 34px` values as they are. The ≤900px overrides (`.site-logo { left: 20px }`, `.menu-btn { left: 20px }` at lines ~1879/1882) stay untouched.

- [ ] **Step 3: Verify in browser at desktop size**

Resize preview to 1280×800, navigate to http://localhost:8934, screenshot. Confirm: the logo squircle's left edge, the hero headline's left edge ("Branding,"), and the Menu pill's left edge sit on the same vertical line. Also scroll down and confirm project tiles/testimonials still look sane (they shifted left with the rail).

- [ ] **Step 4: Commit**

```bash
git add css/styles.css
git commit -m "Align desktop logo, hero, and menu button to one shared left edge."
```

---

### Task 2: Mobile nav overlay — full-screen stacked pills

**Files:**
- Modify: `css/styles.css` — the `@media (max-width: 620px)` block starting at line ~1897 (append rules at its end)

**Interfaces:**
- Consumes: existing `.menu-dock` open/close mechanics (`body.menu-open`, per-item `--d` delays from `js/main.js`) — unchanged.

- [ ] **Step 1: Add the mobile dock styles**

Append inside the `@media (max-width: 620px)` block in `css/styles.css`:

```css
  /* full-screen takeover menu */
  .menu-dock {
    inset: 0;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    padding: 24px;
    background: var(--bg);
    transform: translateY(103%);
  }
  .menu-dock a,
  .menu-dock button {
    width: min(76vw, 330px);
    height: 74px;
    padding: 0;
    font-size: 30px;
    border-radius: 26px;
  }
  .menu-dock .menu-close {
    width: auto;
    min-width: 170px;
    height: 52px;
    padding: 0 30px;
    font-size: 19px;
    margin-top: 10px;
    border-radius: 20px;
  }
```

Note: `inset: 0` overrides the dock's `left:0; bottom:0` so the dark `--bg` backdrop covers the whole screen when open. The existing `transform: translateY(130%)`→`translateY(103%)` override keeps it fully offscreen when closed. Button colors, order, hover fills, and stagger animation are inherited from the base rules.

- [ ] **Step 2: Verify in browser at mobile size**

Resize preview to mobile (375×812), reload http://localhost:8934, click Menu. Screenshot. Confirm: solid dark full-screen backdrop; About Me (blurple), Work (yellow), Let's Talk (orange), Blog (green) stacked vertically, centered, with gaps; smaller cream Close below. Click Close — dock slides away, page visible again. Press Escape after reopening — also closes.

- [ ] **Step 3: Verify desktop dock unchanged**

Resize to 1280×800, click Menu. Confirm the horizontal bottom-left row still renders as before (touching buttons, no backdrop).

- [ ] **Step 4: Commit**

```bash
git add css/styles.css
git commit -m "Restyle mobile nav as full-screen stacked pill takeover."
```

---

### Task 3: Mobile bottom chrome bar (logo icon + Menu pill)

**Files:**
- Modify: all 13 HTML pages (insert `.menu-bar` markup after the standalone `.menu-btn` line)
- Modify: `js/main.js:4-42` (menu wiring: multiple triggers + near-footer on the bar)
- Modify: `css/styles.css` (base `.menu-bar` rules near the `.menu-btn` section, plus display toggles in the 620px block)

**Interfaces:**
- Consumes: `body.menu-open` class mechanics; `.menu-btn.near-footer` pattern.
- Produces: `.menu-bar` element (direct child of `body`) present on every page; its inner button carries class `menu-btn` so existing `body.menu-open .menu-btn` hide-on-open still applies.

- [ ] **Step 1: Insert the bar markup into every page**

Each page has exactly one line `  <button class="menu-btn" aria-label="Open menu">Menu</button>`. Insert this block on the next line (root pages use `href="index.html"`; the 7 files under `projects/` use `href="../index.html"`):

```html
  <div class="menu-bar">
    <a class="menu-bar-logo" href="index.html" aria-label="Brewer home">
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M24 90 L24 34 Q24 14 44 14 L58 14 Q76 14 76 34 L76 56" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="48" cy="75" rx="24" ry="21" stroke="currentColor" stroke-width="9"/></svg>
    </a>
    <button class="menu-btn" aria-label="Open menu">Menu</button>
  </div>
```

Use a scratch Python script to do the insertion mechanically (write to the scratchpad dir, run once):

```python
import pathlib, re
root = pathlib.Path("/Users/quinnbrewer/portfolio4")
pages = list(root.glob("*.html")) + list((root / "projects").glob("*.html"))
needle = '<button class="menu-btn" aria-label="Open menu">Menu</button>'
for p in pages:
    text = p.read_text()
    if text.count(needle) != 1 or "menu-bar" in text:
        print("SKIP", p); continue
    href = "../index.html" if p.parent.name == "projects" else "index.html"
    bar = f'''
  <div class="menu-bar">
    <a class="menu-bar-logo" href="{href}" aria-label="Brewer home">
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M24 90 L24 34 Q24 14 44 14 L58 14 Q76 14 76 34 L76 56" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="48" cy="75" rx="24" ry="21" stroke="currentColor" stroke-width="9"/></svg>
    </a>
    <button class="menu-btn" aria-label="Open menu">Menu</button>
  </div>'''
    p.write_text(text.replace("  " + needle, "  " + needle + bar, 1))
    print("OK", p)
```

Expected output: `OK` for all 13 files, no `SKIP`.

- [ ] **Step 2: Add base bar CSS (hidden by default)**

In `css/styles.css`, after the `.menu-btn.near-footer` rule (~line 269), add:

```css
/* mobile bottom chrome bar — shown ≤620px, replaces the standalone pill */
.menu-bar {
  position: fixed;
  left: 14px;
  right: 14px;
  bottom: 14px;
  z-index: 80;
  display: none;
  align-items: center;
  justify-content: space-between;
  background: var(--cream);
  border-radius: 999px;
  padding: 9px 10px 9px 20px;
  transition: opacity 0.3s, transform 0.25s;
}
.menu-bar-logo {
  display: block;
  width: 36px;
  height: 36px;
  color: var(--ink);
}
.menu-bar-logo svg { width: 100%; height: 100%; display: block; }
.menu-bar .menu-btn {
  position: static;
  background: var(--ink);
  color: var(--cream);
  font-size: 16px;
  padding: 13px 28px;
}
body.menu-open .menu-bar,
.menu-bar.near-footer {
  opacity: 0;
  pointer-events: none;
}
```

- [ ] **Step 3: Toggle bar vs standalone pill at 620px**

Append inside the `@media (max-width: 620px)` block:

```css
  .menu-btn { display: none; }
  .menu-bar { display: flex; }
  .menu-bar .menu-btn { display: block; }
```

- [ ] **Step 4: Wire up multiple menu triggers in js/main.js**

Replace the menu-dock section at the top of the DOMContentLoaded handler (`js/main.js:5-42`) with:

```js
  /* ----- menu dock ----- */
  const menuTriggers = [...document.querySelectorAll(".menu-btn")];
  const menuBar = document.querySelector(".menu-bar");
  const dock = document.querySelector(".menu-dock");
  if (menuTriggers.length && dock) {
    const items = dock.querySelectorAll("a, button");
    items.forEach((el, i) => el.style.setProperty("--d", `${0.05 + i * 0.05}s`));
    menuTriggers.forEach((btn) =>
      btn.addEventListener("click", () => document.body.classList.add("menu-open"))
    );
    dock.querySelector(".menu-close")?.addEventListener("click", () =>
      document.body.classList.remove("menu-open")
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") document.body.classList.remove("menu-open");
    });

    /* hide menu chrome near footer */
    const footer = document.querySelector(".site-footer");
    if (footer) {
      const chrome = menuBar ? [...menuTriggers, menuBar] : menuTriggers;
      let footerTicking = false;
      const updateMenuVisibility = () => {
        const footerTop = footer.getBoundingClientRect().top;
        const threshold = window.innerHeight - 120;
        chrome.forEach((el) => el.classList.toggle("near-footer", footerTop <= threshold));
      };
      updateMenuVisibility();
      window.addEventListener(
        "scroll",
        () => {
          if (footerTicking) return;
          footerTicking = true;
          requestAnimationFrame(() => {
            updateMenuVisibility();
            footerTicking = false;
          });
        },
        { passive: true }
      );
      window.addEventListener("resize", updateMenuVisibility, { passive: true });
    }
  }
```

(The bar's inner button also has class `menu-btn`, so `body.menu-open .menu-btn { opacity: 0 }` and the near-footer fade both keep working; the bar container itself also fades via the new CSS.)

- [ ] **Step 5: Verify in browser**

Mobile 375×812, reload homepage: cream bar spans the bottom with the squircle icon left and dark Menu pill right; no standalone pill. Tap Menu — full-screen menu opens, bar fades. Close it. Scroll to the footer — bar fades out near the footer. Navigate to work.html and projects/rally.html on mobile — bar present, logo link resolves (click icon on rally page → lands on homepage). Desktop 1280×800: no bar visible, standalone Menu pill back, still opens the dock.

- [ ] **Step 6: Commit**

```bash
git add *.html projects/*.html css/styles.css js/main.js
git commit -m "Add mobile bottom chrome bar with logo icon and Menu pill."
```

---

### Task 4: Mobile hero sizing

**Files:**
- Modify: `css/styles.css` — append inside the `@media (max-width: 620px)` block

**Interfaces:**
- Consumes: `.hero` / `.hero .h-display` base rules (lines ~377-393); the ≤900px override `.hero { min-height: 78vh }` (line ~1883).

- [ ] **Step 1: Add mobile hero overrides**

Append inside the `@media (max-width: 620px)` block:

```css
  /* hero: bigger type, shorter section so the first tile peeks in */
  .hero {
    min-height: 0;
    height: calc(100svh - 205px);
    padding-top: 110px;
    padding-bottom: 18px;
  }
  .hero .h-display {
    font-size: clamp(48px, 16.5vw, 72px);
    line-height: 0.95;
    letter-spacing: -0.03em;
  }
```

`height` (not min-height) pins the hero so the first project tile always peeks ~180px into the initial viewport; `100svh` avoids the iOS URL-bar jump. `min-height: 0` neutralizes the 78vh rule from the 900px block.

- [ ] **Step 2: Verify in browser**

Mobile 375×812, hard reload http://localhost:8934. Screenshot after the intro animation (~2s wait). Confirm: headline fills the width at roughly one word-group per line, similar proportion to the reference; the first project tile (Atlas & Ivy) peeks in at the bottom of the viewport; the bottom chrome bar overlays it like the reference; word-reveal animation still played (take screenshot immediately after reload to see words mid-rise if needed). Check 400px-wide viewport too (there's a `@media (max-width: 400px)` block at line ~803 — make sure nothing there conflicts; adjust only if visibly broken).

- [ ] **Step 3: Verify desktop hero unchanged**

Resize 1280×800, reload. Hero fills ~88vh with the giant headline as before, now left-aligned with the chrome from Task 1.

- [ ] **Step 4: Commit**

```bash
git add css/styles.css
git commit -m "Enlarge mobile hero type and shorten hero so first tile peeks in."
```

---

## Final verification (after all tasks)

1. Mobile pass over index, work, about, contact, blog, one project page: chrome bar, menu takeover, no horizontal overflow.
2. Desktop pass over index: left-edge alignment logo/hero/menu; dock unchanged.
3. `git status` clean except intended commits.
