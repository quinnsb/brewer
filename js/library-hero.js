/* ============================================================
   LIBRARY HERO — scroll-driven card animation

   Ported from a React/Framer reference so the page keeps zero dependencies.

   The reference preventDefault()s a 3000px virtual scroll. That is not
   viable here: it would trap a visitor in the hero before they reach a
   single shelf, and it would fight the horizontally-scrolling shelves for
   the same gesture. Progress is real page scroll across exactly one
   viewport instead, so keyboard, trackpad, and touch all work untouched.
   ============================================================ */

import { lerp, circlePosition, arcPosition, springStep } from "./lib/geometry.js?v=hero-orbit2";
/* Keep this URL identical to library.html. A different query string creates a
   second module instance, which renders every shelf and detail handler twice. */
import { openItem, coverPicture } from "./library.js?v=library-detail15";
import { initQuotes } from "./library-quotes.js?v=library-detail15";

const REDUCED =
  matchMedia("(prefers-reduced-motion: reduce)").matches ||
  new URLSearchParams(location.search).get("motion") === "reduce";
/* Keep in step with --card in css/library.css. */
const CARD = 72;
/* The ring is a fixed cast, not a slice of the album shelf. It is a decorative
   device drawn for exactly this many covers: the Discogs import took the album
   count from 25 to 198, and filtering by type turned the ring into a striped
   band of 198 slivers where no single sleeve was recognisable.

   Pinned by id, in this order, because the arrangement was composed rather than
   sorted. An id that no longer exists is dropped with a warning rather than
   leaving a hole in the circle. */
const RING = [
  "album-coloring-book",
  "album-where-the-light-is-john-mayer-live-in-los-angeles",
  "album-in-between-dreams",
  "album-blonde-on-blonde",
  "album-kind-of-blue",
  "album-transatlanticism",
  "album-reading-writing-and-arithmetic",
  "album-night-train",
  "album-a-boy-named-charlie-brown",
  "album-gordon",
  "album-come-away-with-me",
  "album-mr-finish-line",
  "album-magic",
  "album-messy",
  "album-plans",
  "album-thriller",
  "album-sound-of-silver",
  "album-songs-in-the-key-of-life",
  "album-the-crux",
  "album-upstairs-at-erics",
  "album-talon-of-the-hawk",
  "album-the-joshua-tree",
  "album-charm",
  "album-jackson-square",
  "album-funeral",
];

const ORBIT_DEGREES_PER_SECOND = 3;

function card(item) {
  const btn = document.createElement("button");
  btn.className = "hcard";
  btn.type = "button";
  btn.setAttribute("aria-label", item.title);
  btn.dataset.id = item.id;

  const media = document.createElement("span");
  media.className = "hcard-media";
  /* 72px on screen, so the smallest derivative there is. These twenty-five are
     the first images the page asks for, so they are also the ones that decide
     how long the hero takes to form. */
  media.append(coverPicture(item, { tier: "shelf" }));
  btn.append(media);
  return btn;
}

/* ---------- rotating verb ---------- */

export async function initHero(items) {
  const stage = document.getElementById("hero-stage");
  const cutoff = document.getElementById("hero-cutoff");
  if (!stage) return;
  if (stage.dataset.heroInitialized === "true") return;
  stage.dataset.heroInitialized = "true";

  /* The headline used to be "You are what you [read / listen to / watch]",
     one word cycling in a fixed slot. It is a quotation now, picked at random
     per visit, and the h1 above it is a static, visually hidden page name. The
     reveal is held back rather than fired here: cards land first, and type that
     arrives before them is type nobody is looking at.

     Awaited because the quotes have to be fetched before they can be revealed.
     A failure inside initQuotes leaves an empty hero rather than throwing, so
     the ring below is never at risk of not being drawn. */
  const revealQuote = await initQuotes("#hero-quote");
  /* Faded out by scroll below. The whole block, not the h1: the h1 is
     visually hidden now, so fading it would be fading nothing. */
  const centrepiece = document.getElementById("hero-quote");

  /* The catalogue is the ring: every album appears once, with no clones. */
  const byId = new Map(items.map((item) => [item.id, item]));
  const heroItems = RING.map((id) => byId.get(id)).filter(Boolean);
  const dropped = RING.length - heroItems.length;
  if (dropped) console.warn(`Hero ring: ${dropped} of ${RING.length} albums no longer exist`);
  if (!heroItems.length) return;

  const nodes = heroItems.map((item) => {
    const n = card(item);
    n.addEventListener("click", () => openItem(item.id));
    stage.append(n);
    return n;
  });

  const total = nodes.length;
  const scatter = nodes.map(() => ({
    x: (Math.random() - 0.5) * 1500,
    y: (Math.random() - 0.5) * 900,
    rotation: (Math.random() - 0.5) * 180,
    scale: 0.6,
    opacity: 0,
  }));

  /* Cards land first, then the quotation reveals at the centre of the ring they
     just formed.

     Not on a timer. Switching to the circle phase at 2500ms only sets the
     springs a new target; the covers are still travelling for a good while
     after that, and revealing on the switch put the words up while the ring was
     visibly still closing around them. The frame loop below calls this once the
     springs have actually come to rest, so the two never overlap however long
     the settle takes on a given machine. */
  let phase = REDUCED ? "circle" : "scatter";
  let quoteShown = false;
  const showQuote = () => {
    if (quoteShown) return;
    quoteShown = true;
    revealQuote();
  };
  if (REDUCED) {
    showQuote();
  } else {
    setTimeout(() => (phase = "line"), 500);
    setTimeout(() => (phase = "circle"), 2500);
    /* A spring that is being fought by a resize, or a tab that was in the
       background while the intro played, could take a long time to satisfy the
       settle test. The words matter more than the choreography, so they arrive
       regardless after this. */
    setTimeout(showQuote, 7000);
  }

  const state = scatter.map((s) => ({ ...s, v: { x: 0, y: 0, r: 0, s: 0 } }));

  const geom = () => {
    const w = innerWidth;
    const h = innerHeight;
    const mobile = w < 768 || h < 600;
    const spread = 150;
    const scale = mobile ? 0.9 : 1.25;

    /* Derive the radius from the viewport rather than picking one, so the
       whole fan always fits on screen. A chord of 2R*sin(spread/2) is the
       arc's width; solving for R from the width we want is what keeps the
       end cards reachable. The reference hard-coded a radius and let the
       ends run off-screen, which only worked because it had a scroll-driven
       shuffle to rotate hidden cards into view. This has no shuffle, so an
       off-screen card is simply an item nobody can ever see.

       The chord positions card CENTRES, so the end cards still stick out by
       their own half-diagonal (they are rotated to sit normal to the arc).
       Subtracting that extent is what stops them being sliced by the
       viewport edge, and it matters most on narrow screens where a card is
       a large fraction of the width. */
    const extent = CARD * scale * 1.45;
    const chord = Math.max(w - extent, w * 0.45);
    const halfSpread = ((spread / 2) * Math.PI) / 180;
    const edgeDrop = 1 - Math.cos(halfSpread);
    const widthRadius = chord / (2 * Math.sin(halfSpread));
    /* On a very wide viewport, fitting the chord alone can make the arc too
       tall for the stage. Cap its radius only when needed so the apex and
       both end cards can still occupy the same viewport. */
    const heightRadius = Math.max(0, h - extent) / edgeDrop;
    const arcR = Math.min(widthRadius, heightRadius);
    const maxApexY = h / 2 - extent / 2 - arcR * edgeDrop;

    return {
      mobile,
      circleR: Math.min(mobile ? w * 0.42 : Math.min(w, h) * 0.35, h * 0.35, 350),
      circleScale: mobile ? 0.58 : 1,
      arcR,
      /* Distance from the STAGE CENTRE down to the arc apex, not from the
         top of the viewport. Cards are positioned at top:50%/left:50%, so
         every offset here is already relative to the middle. Treating this
         as a from-the-top value (as the reference does) double-counts half
         a viewport and drops the whole arc below the fold. */
      apexY: Math.min(h * 0.08, maxApexY),
      /* The sticky stage supplies the depth cue: as the page advances, the
         rainbow drifts upward more slowly than the document beneath it. */
      parallaxTravel: Math.min(72, h * 0.09),
      spread,
      scale,
    };
  };

  /* Exactly one viewport of real scrolling takes the ring to the finished arc. */
  const progress = () => (REDUCED ? 1 : Math.min(Math.max(scrollY / innerHeight, 0), 1));

  let last = performance.now();
  let orbitAngle = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    const g = geom();
    const p = progress();
    /* Once the opening choreography has settled, the album ring makes one
       unhurried turn every two minutes. The first scroll freezes its current
       angle, so the circle-to-arc morph begins from the exact visible state
       instead of snapping the covers back to their original slots. */
    if (!REDUCED && phase === "circle" && p < 0.001) {
      orbitAngle = (orbitAngle + ORBIT_DEGREES_PER_SECOND * dt) % 360;
    }
    const scrollParallaxY = REDUCED ? 0 : -p * g.parallaxTravel;
    const release = REDUCED ? 0 : Math.min(Math.max((p - 0.7) / 0.3, 0), 1);
    const easedRelease = release * release * (3 - 2 * release);
    if (cutoff) cutoff.style.transform = `translateY(${((1 - easedRelease) * 100).toFixed(2)}%)`;

    /* The quotation lives at the centre of the ring, which is exactly where
       the arc sweeps through. Retire it as the arc forms rather than let the
       two fight over the same space. */
    if (!REDUCED && centrepiece) {
      const fade = 1 - Math.min(Math.max((p - 0.2) / 0.35, 0), 1);
      centrepiece.style.opacity = fade.toFixed(3);
      centrepiece.style.pointerEvents = fade < 0.05 ? "none" : "";
    }

    let settleMin = Infinity;
    let settleMax = 0;
    let settleCount = 0;

    for (let i = 0; i < total; i++) {
      const hiddenOnMobile = g.mobile && i % 2 === 1;
      if (hiddenOnMobile) {
        nodes[i].style.opacity = "0";
        nodes[i].style.pointerEvents = "none";
        nodes[i].tabIndex = -1;
        continue;
      }
      nodes[i].style.pointerEvents = "";
      nodes[i].tabIndex = 0;
      const layoutIndex = g.mobile ? i / 2 : i;
      const layoutTotal = g.mobile ? Math.ceil(total / 2) : total;
      let target;
      if (phase === "scatter") {
        target = scatter[i];
      } else if (phase === "line") {
        /* The row has to fit the screen it is drawn on. A flat 78px pitch put
           thirteen phone cards across 1014px of a 393px viewport, so for the
           two seconds of the intro four to seven covers sat entirely outside
           the frame and the rest slid in from past the edges. Derive the pitch
           from the width instead, capped at the original 78px so nothing
           changes on a desktop, where thirteen cards never came close to the
           edge in the first place. */
        const spacing = Math.min(78, (g.mobile ? innerWidth * 0.92 : innerWidth) / layoutTotal);
        target = {
          x: (layoutIndex - (layoutTotal - 1) / 2) * spacing,
          y: 0, rotation: 0, scale: 1, opacity: 1,
        };
      } else {
        const c = circlePosition(layoutIndex, layoutTotal, g.circleR, orbitAngle);
        const a = arcPosition(layoutIndex, layoutTotal, {
          radius: g.arcR,
          centerY: g.apexY + g.arcR,
          spread: g.spread,
          offset: 0,
        });
        target = {
          /* Both layouts are centred on x=0. Keeping scroll motion on the
             vertical axis prevents the rainbow from wandering sideways. */
          x: lerp(c.x, a.x, p),
          y: lerp(c.y, a.y, p) + scrollParallaxY,
          rotation: lerp(c.rotation, a.rotation, p),
          scale: lerp(g.circleScale, g.scale, p),
          opacity: 1,
        };
      }

      const s = state[i];
      if (REDUCED) {
        Object.assign(s, target);
      } else {
        ({ value: s.x, velocity: s.v.x } = springStep(s.x, target.x, s.v.x, dt, 40, 15));
        ({ value: s.y, velocity: s.v.y } = springStep(s.y, target.y, s.v.y, dt, 40, 15));
        ({ value: s.rotation, velocity: s.v.r } = springStep(s.rotation, target.rotation, s.v.r, dt, 40, 15));
        ({ value: s.scale, velocity: s.v.s } = springStep(s.scale, target.scale, s.v.s, dt, 40, 15));
        s.opacity = lerp(s.opacity, target.opacity, 1 - Math.exp(-6 * dt));
      }

      nodes[i].style.transform =
        `translate3d(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px, 0) ` +
        `rotate(${s.rotation.toFixed(2)}deg) scale(${s.scale.toFixed(3)})`;
      nodes[i].style.opacity = s.opacity.toFixed(3);

      /* Distance from the centre, not distance from target. The ring turns
         while it sits there, at ORBIT_DEGREES_PER_SECOND, so every target is
         always moving and every spring is always chasing one: a test for
         "has stopped" is a test that is never satisfied, and the fallback
         below would end up doing all the work. What actually says the ring is
         formed is that the covers agree on a radius. That is true whatever
         angle the orbit has reached. */
      if (!quoteShown && phase === "circle") {
        const radius = Math.hypot(s.x, s.y - scrollParallaxY);
        if (radius < settleMin) settleMin = radius;
        if (radius > settleMax) settleMax = radius;
        settleCount += 1;
      }
    }

    /* Six pixels of disagreement across every visible cover, on a radius of a
       few hundred. Tighter than the eye can see a gap at, loose enough that the
       orbit and the sub-pixel jitter of a settled spring do not hold it open. */
    if (!quoteShown && phase === "circle" && settleCount > 1 && settleMax - settleMin < 6) {
      showQuote();
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
