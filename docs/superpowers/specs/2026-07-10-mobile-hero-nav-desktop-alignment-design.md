# Mobile hero + nav rework, desktop left-edge alignment

Date: 2026-07-10
Status: Approved (verbally); pending final spec review

## Goal

Match the mobile homepage hero and mobile nav to the Trust Design Shop reference
screenshots, and align the desktop homepage's hero text, logo, and menu button to a
single shared left edge per the desktop reference.

All changes are CSS-first in `css/styles.css`, with a small HTML addition for the
mobile bottom bar and a minor JS touch if needed for wiring. No animation logic
changes.

## 1. Mobile hero (index.html, ≤620px)

- Headline gets bigger and bolder relative to the viewport (~1 word-group per line,
  roughly 15–17vw), matching the reference proportions.
- `.hero` gets a shorter `min-height` / tighter padding so the first project tile
  peeks in at the bottom of the initial viewport.
- The existing word-by-word reveal animation (`.split`) is untouched — sizing and
  spacing only.

## 2. Mobile nav overlay (`.menu-dock`, all pages, ≤620px)

- Button order and labels stay exactly as today: About Me, Work, Let's Talk, Blog,
  Close.
- Layout switches from the horizontal touching row to a vertical stack of wide
  rounded-rect pills with visible gaps, centered like the reference.
- A solid dark backdrop (page bg color) covers the full screen when the menu is
  open, so it reads as a full-screen takeover.
- Close stays visually smaller than the nav pills, sitting below them.
- Desktop (>620px) dock is unchanged.

## 3. Mobile bottom chrome bar (all pages, ≤620px)

- The standalone fixed "Menu" pill is replaced on mobile by one wide cream bar
  fixed at the bottom, spanning most of the viewport width with rounded corners.
- Inside the bar: small logo icon (link to home) on the left, dark "Menu" pill
  button on the right.
- Implementation: add the bar's markup next to the existing `.menu-btn` in each
  page's HTML; CSS shows the bar and hides the standalone pill at ≤620px, and vice
  versa above. The bar's Menu button reuses the same open-menu behavior (JS binds
  to all menu triggers).
- The top-left logo + wordmark keeps its current scroll show/hide behavior.
- The bar hides near the footer the same way the current Menu pill does.

## 4. Desktop left-edge alignment (homepage, >900px)

- Today: `.site-logo` and `.menu-btn` are fixed at `left: 34px`, while homepage
  content starts at `--home-rail` (≈76–120px), so the hero text is indented
  relative to the logo/menu.
- Change: introduce one shared left-edge value (a `:root` custom property, e.g.
  `--page-edge`) used by `.site-logo` `left`, `.menu-btn` `left`, and the
  homepage's hero left edge, so all three sit flush on the same vertical line as
  in the reference.
- The hero currently pulls itself out of the logo gutter with a negative margin;
  that mechanism is adjusted (not necessarily removed) so its computed left edge
  equals `--page-edge`.
- Other pages keep their current layout; only the shared chrome offset and the
  homepage rail are affected.

## Error handling / risk

- Static site, no build step. Risk is visual regression on other pages that share
  the chrome (about, work, blog, contact, projects/*): verify the bottom bar and
  dock on at least one non-home page.
- `prefers-reduced-motion` rules already exist; new backdrop uses a simple
  opacity/transform transition consistent with current patterns.

## Testing

Browser-preview verification at 375×812 (mobile) and 1280×800+ (desktop):

1. Mobile home: hero fills most of first screen with tile peeking; headline sized
   like reference; animation still plays.
2. Mobile menu: full-screen dark takeover, stacked pills, Close works, Escape
   works.
3. Mobile bottom bar: cream bar with logo icon + Menu pill; hides near footer.
4. Desktop home: logo icon, hero text left edge, and Menu button all on one
   vertical line.
5. Spot-check one interior page (work.html) on mobile and desktop.
