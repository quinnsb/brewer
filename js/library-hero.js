/* ============================================================
   LIBRARY HERO — scroll-driven card animation

   Ported from a React/Framer reference so the page keeps zero dependencies.

   The reference preventDefault()s a 3000px virtual scroll. That is not
   viable here: it would trap a visitor in the hero before they reach a
   single shelf, and it would fight the horizontally-scrolling shelves for
   the same gesture. Progress is real page scroll across exactly one
   viewport instead, so keyboard, trackpad, and touch all work untouched.
   ============================================================ */

import { lerp, circlePosition, arcPosition, springStep } from "./lib/geometry.js";
import { openItem } from "./library.js?v=feedback5";

const REDUCED =
  matchMedia("(prefers-reduced-motion: reduce)").matches ||
  new URLSearchParams(location.search).get("motion") === "reduce";
/* Keep in step with --card in css/library.css. */
const CARD = 72;
const VERBS = ["read", "listen to", "watch"];

function card(item) {
  const btn = document.createElement("button");
  btn.className = "hcard";
  btn.type = "button";
  btn.setAttribute("aria-label", item.title);
  btn.dataset.id = item.id;

  const media = document.createElement("span");
  media.className = "hcard-media";
  const img = document.createElement("img");
  img.src = item.cover;
  img.alt = "";
  img.loading = "lazy";
  media.append(img);
  btn.append(media);
  return btn;
}

/* ---------- rotating verb ---------- */

function rotateVerb(slot, sr) {
  const STAGGER = 24;
  const DUR = 440;
  let vi = 0;
  let current = null;

  const build = (word) => {
    const w = document.createElement("span");
    w.className = "word";
    for (const c of word) {
      const mask = document.createElement("span");
      mask.className = "mask";
      const ch = document.createElement("span");
      ch.className = "ch enter";
      ch.textContent = c;
      mask.append(ch);
      w.append(mask);
    }
    return w;
  };

  const render = (word) => {
    /* Keep the accessible sentence in step with the visible one. Without
       this the screen-reader text is stuck on whichever verb rendered
       first, which is worse than no live text at all. */
    if (sr) sr.textContent = word;

    const outgoing = current;
    if (outgoing) {
      /* Lift it out of flow FIRST. Otherwise its characters keep their
         width while the incoming word is appended beside them, and the
         verb visibly drifts right mid-transition. */
      outgoing.classList.add("out");
      const gone = outgoing.querySelectorAll(".ch");
      gone.forEach((ch, i) => setTimeout(() => ch.classList.add("leave"), i * STAGGER));
      setTimeout(() => outgoing.remove(), gone.length * STAGGER + DUR + 60);
    }

    const incoming = build(word);
    slot.append(incoming);
    current = incoming;
    const chars = incoming.querySelectorAll(".ch");
    requestAnimationFrame(() =>
      chars.forEach((ch, i) => setTimeout(() => ch.classList.remove("enter"), i * STAGGER))
    );
  };

  /* First verb is painted immediately so the reveal has something to blur
     in, but the cycle does not start until the headline has arrived. */
  render(VERBS[0]);

  return function start() {
    if (REDUCED) return;
    setInterval(() => {
      vi = (vi + 1) % VERBS.length;
      render(VERBS[vi]);
    }, 2200);
  };
}

export function initHero(items) {
  const stage = document.getElementById("hero-stage");
  const cutoff = document.getElementById("hero-cutoff");
  const slot = document.getElementById("verb-slot");
  if (!stage || !slot) return;

  /* Screen readers get the sentence, not a stream of characters. The
     per-character spans are hidden from them for the same reason. */
  const sr = document.createElement("span");
  sr.className = "sr-only";
  slot.parentElement.append(sr);
  slot.setAttribute("aria-hidden", "true");

  const startRotating = rotateVerb(slot, sr);
  const line = document.getElementById("hero-heading");

  /* The shelf can grow without turning the hero into confetti. Keep its
     original 32-card density and sample books across the full collection. */
  const evenSample = (list, limit) => {
    if (list.length <= limit) return list;
    return Array.from({ length: limit }, (_, index) =>
      list[Math.round(index * (list.length - 1) / (limit - 1))]
    );
  };
  const heroItems = [
    ...evenSample(items.filter((item) => item.type === "book"), 8),
    ...evenSample(items.filter((item) => item.type === "album"), 12),
    ...evenSample(items.filter((item) => item.type === "film"), 8),
    ...evenSample(items.filter((item) => item.type === "other"), 4),
  ];

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

  /* Cards land first, then the headline blurs in at the centre of the ring
     they just formed. Rotating the verb before that would animate type
     nobody can see yet. */
  let phase = "circle";
  if (REDUCED) {
    line.classList.add("is-in");
    startRotating();
  } else {
    setTimeout(() => {
      line.classList.add("is-in");
      setTimeout(startRotating, 1100);
    }, 220);
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
  let initialized = false;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    const g = geom();
    const p = progress();
    const scrollParallaxY = REDUCED ? 0 : -p * g.parallaxTravel;
    const release = REDUCED ? 0 : Math.min(Math.max((p - 0.7) / 0.3, 0), 1);
    const easedRelease = release * release * (3 - 2 * release);
    if (cutoff) cutoff.style.transform = `translateY(${((1 - easedRelease) * 100).toFixed(2)}%)`;

    /* The headline lives at the centre of the ring, which is exactly where
       the arc sweeps through. Retire it as the arc forms rather than let
       the two fight over the same space. */
    if (!REDUCED) {
      const fade = 1 - Math.min(Math.max((p - 0.2) / 0.35, 0), 1);
      line.style.opacity = fade.toFixed(3);
      line.style.pointerEvents = fade < 0.05 ? "none" : "";
    }

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
        const spacing = 78;
        target = {
          x: layoutIndex * spacing - (layoutTotal * spacing) / 2,
          y: 0, rotation: 0, scale: 1, opacity: 1,
        };
      } else {
        const c = circlePosition(layoutIndex, layoutTotal, g.circleR);
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
        /* Paint the ring at its real starting geometry, then fade it in. The
           old scatter and line transit left covers crossing the headline for
           several seconds on narrow screens. */
        if (!initialized) {
          s.x = target.x;
          s.y = target.y;
          s.rotation = target.rotation;
          s.scale = target.scale;
          s.opacity = 0;
          s.v = { x: 0, y: 0, r: 0, s: 0 };
        }
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
    }

    initialized = true;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
