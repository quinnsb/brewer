# Lab colour themes

How to add a colour theme to `homepage-lab.html`. Adding one is two edits and
touches no structural CSS.

The lab is `noindex, nofollow` and nothing links to it. Every selector in
`css/homepage-lab.css` is scoped to `.lab-home`, so none of this can reach the
production pages.

## Files

| File | Role |
|---|---|
| `css/homepage-lab.css` | token contract, theme blocks, structural rules, switcher styles |
| `js/lab-theme.js` | the switcher; theme list lives in the `THEMES` array |
| `homepage-lab.html` | loads both; carries `data-lab-theme` on `<body>` |

A theme is a value of `data-lab-theme` on `<body class="lab-home">`. The
switcher writes that attribute and remembers the choice in `localStorage`.

## The "original" theme

`original` is the live site, and it is the default. It has no theme block and
sets no tokens.

Every structural rule in section 3 is scoped to `.lab-themed`, a class the
switcher adds for every theme *except* `original`. So it is not a
reconstruction of the production palette out of tokens — it is the lab with
all of its restyling switched off, which is the only way it can be guaranteed
to match. Use it as the reference to compare the others against.

Two consequences worth knowing:

- Adding a theme means adding the tokens **and** getting the `.lab-themed`
  class, which the switcher handles automatically. Nothing to do by hand.
- If you ever add a structural rule scoped to `.lab-home` rather than
  `.lab-themed`, it will leak into the original theme and quietly stop it
  being a faithful reference. Section 3 rules are always `.lab-themed`.

## Adding a theme

### Step 1 — add the CSS block

In `css/homepage-lab.css`, under section 2, copy this template and fill in the
eighteen values. Put it next to the other theme blocks; order does not matter.

```css
.lab-home[data-lab-theme="YOUR-ID"] {
  --t-ground: #______;
  --t-ink: #______;
  --t-surface: #______;
  --t-surface-on: #______;

  --t-a1: #______;  --t-a1-on: #______;
  --t-a2: #______;  --t-a2-on: #______;
  --t-a3: #______;  --t-a3-on: #______;
  --t-a4: #______;  --t-a4-on: #______;

  --t-panel: #______;    --t-panel-on: #______;
  --t-graphic: #______;  --t-graphic-on: #______;
  --t-cta: #______;      --t-cta-on: #______;
  --t-strip: #______;    --t-strip-on: #______;

  --t-tint-1: #______;
  --t-tint-2: #______;
}
```

### Step 2 — register it

In `js/lab-theme.js`, add one entry to `THEMES`:

```js
var THEMES = [
  { id: "plum", label: "Plum" },
  { id: "graphite", label: "Graphite" },
  { id: "YOUR-ID", label: "Your Label" }
];
```

The `id` must match the `data-lab-theme` value in the CSS block. That is the
whole job — the switcher button, the persistence, and every themed element
follow from those two edits.

## Adding a font set

Type is a second, independent axis: `data-lab-font` on the same `<body>`. Any
theme combines with any font set, and each remembers its own choice.

The whole stylesheet already routes type through three variables, which is why
this is cheap — a set only redefines those three.

### Step 1 — add the CSS block

In `css/homepage-lab.css`, under the FONT SETS section:

```css
.lab-home[data-lab-font="YOUR-ID"] {
  --sans: "Body Face", "Helvetica Neue", Arial, sans-serif;
  --sans-display: "Heading Face", Arial, sans-serif;
  --serif: "Quote Face", Georgia, serif;
}
```

`--sans` is body and UI, `--sans-display` is the big hero and headings,
`--serif` is pull quotes and the testimonial carousel. To change only the
headings, copy the `degular` block and swap `--sans-display` — that is exactly
what the `aeonik` set does.

### Step 2 — load the family

For a local file, add an `@font-face` next to the set's block, pointing at
`../fonts/`. For a hosted family, add it to the Google Fonts `<link>` in
`homepage-lab.html`. Either way it lives only in the lab, so production never
pays for it.

Declare the weight ranges against what the page actually asks for. Degular is
used at 400 (the capabilities list), 500 (menu, buttons, tile captions,
credits) and 600 (wordmark, headings). The `aeonik` set therefore loads two
cuts and splits them at `100 450` / `451 900`, so the list stays Regular while
everything else lands on Medium. A single cut declared `100 900` maps *every*
weight onto that one file, which renders the 400 text semi-bold.

### Step 4 — re-measure the logo lockup

This one is easy to miss. `styles.css` locks the ⓑ mark to the **"Q" of the
wordmark**: it sizes the mark to that letter's cap-plus-tail span and nudges
it down by the tail depth, using ratios measured off Degular
(`--q-cap: 0.613`, `--q-tail: 0.095`). Change the wordmark's face without
re-measuring and the icon and the lettering end up different heights.

Measure the new face in the console:

```js
var c = document.createElement('canvas').getContext('2d');
c.font = '600 200px "Your Face"';
var t = c.measureText('Q');
console.log(t.actualBoundingBoxAscent / 200, t.actualBoundingBoxDescent / 200);
```

then set the pair on `.site-logo` for that font set. Aeonik came out at
`0.706` / `0.006` — a taller cap and a Q that sits essentially on the
baseline, where Degular's tail drops well below it.

### Step 3 — register it

Add one entry to `FONT_SETS` in `js/lab-theme.js`.

### Watch for

Faces differ in width and optical size at the same `font-size`. Degular's
display tracking is tight, so a substitute usually needs its heading
letter-spacing relaxed — the `aeonik` set pulls it back from `-0.02em` to
`-0.012em`. A much wider face would also need its own smaller clamp on
`.h-display` or the hero overruns its column. Expect one or two adjustments
per set; they belong next to that set's block.

## What each token drives

| Token | Drives | Contrast floor |
|---|---|---|
| `--t-ground` | page background | — |
| `--t-ink` | body and display type on the ground | 4.5:1 on ground |
| `--t-surface` | footer body, dark cards | — |
| `--t-surface-on` | type on that surface | 4.5:1 on surface |
| `--t-a1` | capabilities panel, primary pills, 3rd testimonial, 2nd social | — |
| `--t-a2` | about panel, footer CTA button, 1st testimonial, 3rd social, eyebrows | — |
| `--t-a3` | tile captions, about-teaser card, mobile bar, 2nd testimonial, 1st social, menu pill 1 | — |
| `--t-a4` | menu pill 4, 4th social | — |
| `--t-aN-on` | type sitting on accent N | 4.5:1 on that accent |
| `--t-panel` | the capabilities / "Let's work together" panel | — |
| `--t-panel-on` | body copy on that panel | 4.5:1 on panel |
| `--t-graphic` | icon-only buttons on the ground: "see all work" arrow, LinkedIn social | 3:1 on ground |
| `--t-graphic-on` | the glyph inside them | 3:1 on graphic |
| `--t-cta` | the big CTA pill, which sits on the `--t-panel` block | 3:1 on panel |
| `--t-cta-on` | the arrow inside it; also the hover fill | 3:1 on cta |
| `--t-strip` | the strip at the very bottom of the footer | — |
| `--t-strip-on` | fine print on that strip | 4.5:1 on strip |
| `--t-tint-1/2` | placeholder and card gradients | — |

## Rules that keep a theme honest

**The four accents must be visually distinct, and distinct from
`--t-surface`.** They are dealt out to the four menu pills and the four social
icons, which sit side by side — two accents that read alike look like a
mistake in both places. `--t-a4` in particular must differ from `--t-surface`,
or the LinkedIn icon disappears into the footer panel it sits on.

Only `a1..a4` are used where four-way distinctness is required. `--t-graphic`
is free to repeat an accent value.

**`--t-strip` must differ from `--t-surface`.** The footer panel has rounded
bottom corners and `.site-footer` shows through beneath it. That reveal is the
"different colour at the very bottom". Setting both to the same value erases a
deliberate piece of the design.

**`--t-graphic` and `--t-cta` are the only slots that may sit at 3:1.** They are
used exclusively on buttons that contain an SVG and no text, where 3:1 is the
applicable threshold for graphical objects. Use them for mid-tones that cannot
carry small text. Never point a text-bearing rule at either.

**Check a graphic slot against what it actually sits on.** `--t-graphic` sits
on the ground; `--t-cta` sits on the `--t-panel` block. That is why they are
two tokens and not one: a value that reads well on the ground can disappear on
the panel.

**The biggest block of colour is a composition decision.** `--t-panel` is its
own token rather than reusing `--t-a1` precisely so a theme can use its
loudest colour as an accent without it becoming the largest area on the page.
The plum theme does this deliberately: `#C22A15` is named "Feature Red", so it
is the CTA pill sitting on a cream panel, not the panel itself.

**Set a surface's fill and ink in one declaration, and let everything inside
inherit.** This is the rule that prevents light-on-light. A themed surface gets
exactly:

```css
.lab-home .some-surface { background: var(--t-aN); color: var(--t-aN-on); }
```

and nothing else. No per-descendant `color` rules. Headings, body copy, links
and arrows all inherit, and where body copy needs to be dimmer it is derived
with `color-mix(in srgb, currentColor …%, transparent)` rather than a literal.

The failure this avoids: when the fill lives in one rule and the ink in
another — worse, in a different file — any change that touches one and not the
other desyncs them, and the text disappears into its own background. The
`.teaser-card` and `.tile-caption` surfaces both hit this. Because the pair is
now a single line, and `--t-aN` / `--t-aN-on` are defined adjacently in every
theme block, it takes a deliberate effort to break.

**Do not add literal colours to section 3.** If a new theme needs a colour the
contract has no slot for, add a token to the contract and set it in every
theme, rather than special-casing one theme inside the structural rules.

## Source palette data is not always trustworthy

Brand sheets get assembled by hand and the numbers drift out of sync with the
swatches. Read the hex against the swatch before using it.

Two that have already bitten:

- The **ILM sheet** has copy-paste errors down its second row: Midnight Blue,
  Blue Screen, Saber Blue and Abyss Blue all carry the hex and RGB values of
  the red/brown/gold swatches directly above them, and Tatooine and Indy Khaki
  share one value despite being visibly different. The `ilm` theme is built
  only from swatches whose hex matches what is shown — which is why it has no
  blues in it.
- The **plum sheet** had its hex and RGB columns mismatched throughout: the
  swatch labelled "base white" is olive `#857B4C` but lists RGB 255,250,243.
  The hex values were the ones that matched the swatches.

When they disagree, trust the swatch, and say which values you discarded.

## Known contrast shortfall

The **plum** theme points `--t-a4` at olive `#857B4C`, which reaches only
3.6:1 against its cream label. That clears the 3:1 bar for UI shapes and icons
but is under AA's 4.5:1 for the menu dock's 14px text. It is kept on purpose:
olive is the only fourth hue the supplied palette offers, and the alternative
was inventing a brown that is not in the palette. If that theme ever graduates
out of the lab, either darken the olive or drop the dock label to a size that
qualifies as large text.

## Colours the base stylesheet hardcodes

These never passed through a token in `css/styles.css`, so they survive a
token-only swap and must stay explicitly overridden in section 3. If a future
element looks stubbornly off-theme, suspect this list first.

| Where | Hardcoded value |
|---|---|
| `.cta-pill` hover fill | `var(--cream)` on `::before` |
| `.cta-pill` background | `#3b66ff` |
| `.cta-pill` arrow stroke | inline `stroke="#ffb900"` on the SVG in the markup |
| `.socials .s-linkedin` | `#3b66ff` |
| `.site-footer` | `#ffbd00` |
| `.testimonial-attribution a:hover` | `#ffb900` underline |

The inline arrow stroke is a presentation attribute, which any CSS `stroke`
declaration outranks — no `!important` needed.

## Things that are intentionally not themed

The client work tiles (`.ms-work-tile`, `.ccn-work-tile`, `.tfi-work-tile`)
keep their own brand artwork. Recolouring them would misrepresent the clients'
brands. Only their captions pick up the theme.

## Checking a theme

Load `homepage-lab.html`, then for each theme:

1. Scroll the full page. The hero, work tiles, testimonials, capabilities
   panel, about panel and footer should all read as one system.
2. Open the menu at desktop width. Four distinct pills, floating — no slab
   behind them. `.menu-dock` is a transparent container; never give it a
   background.
3. Narrow to under 900px. `.menu-bar` appears as a light pill on the ground.
   It should not invert to the ground colour and disappear.
4. Check the very bottom of the footer is a different colour from the panel
   above it, and that the four social icons are four different colours.
