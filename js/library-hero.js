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
import { openItem } from "./library.js";

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
/* Keep in step with --card in css/library.css. */
const CARD = 72;
const VERBS = ["read", "listen to", "watch", "play", "whatever"];

function card(item) {
  const btn = document.createElement("button");
  btn.className = "hcard";
  btn.type = "button";
  btn.setAttribute("aria-label", item.title);
  btn.dataset.id = item.id;

  const flip = document.createElement("span");
  flip.className = "hcard-flip";

  const front = document.createElement("span");
  front.className = "hcard-face";
  const img = document.createElement("img");
  img.src = item.cover;
  img.alt = "";
  img.loading = "lazy";
  front.append(img);

  const back = document.createElement("span");
  back.className = "hcard-face hcard-back";
  const t = document.createElement("span");
  t.className = "t";
  t.textContent = item.title;
  const c = document.createElement("span");
  c.className = "c";
  c.textContent = [item.creator, item.year].filter(Boolean).join(", ");
  back.append(t, c);

  flip.append(front, back);
  btn.append(flip);
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

  const nodes = items.map((item) => {
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
  let phase = REDUCED ? "circle" : "scatter";
  if (REDUCED) {
    line.classList.add("is-in");
    startRotating();
  } else {
    setTimeout(() => (phase = "line"), 500);
    setTimeout(() => {
      phase = "circle";
      line.classList.add("is-in");
      setTimeout(startRotating, 1200);
    }, 2500);
  }

  const state = scatter.map((s) => ({ ...s, v: { x: 0, y: 0, r: 0, s: 0 } }));
  let parallax = 0;
  let parallaxV = 0;
  let parallaxTarget = 0;

  if (!REDUCED) {
    addEventListener("mousemove", (e) => {
      parallaxTarget = ((e.clientX / innerWidth) * 2 - 1) * 100;
    });
  }

  const geom = () => {
    const w = innerWidth;
    const h = innerHeight;
    const mobile = w < 768;
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
    const arcR = chord / (2 * Math.sin(((spread / 2) * Math.PI) / 180));

    return {
      circleR: Math.min(Math.min(w, h) * 0.35, 350),
      arcR,
      /* Distance from the STAGE CENTRE down to the arc apex, not from the
         top of the viewport. Cards are positioned at top:50%/left:50%, so
         every offset here is already relative to the middle. Treating this
         as a from-the-top value (as the reference does) double-counts half
         a viewport and drops the whole arc below the fold. */
      apexY: h * 0.08,
      spread,
      scale,
    };
  };

  /* Exactly one viewport of real scrolling takes the ring to the finished arc. */
  const progress = () => (REDUCED ? 1 : Math.min(Math.max(scrollY / innerHeight, 0), 1));

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    const g = geom();
    const p = progress();
    ({ value: parallax, velocity: parallaxV } = springStep(
      parallax, parallaxTarget, parallaxV, dt, 30, 20
    ));

    /* The headline lives at the centre of the ring, which is exactly where
       the arc sweeps through. Retire it as the arc forms rather than let
       the two fight over the same space. */
    if (!REDUCED) {
      const fade = 1 - Math.min(Math.max((p - 0.2) / 0.35, 0), 1);
      line.style.opacity = fade.toFixed(3);
      line.style.pointerEvents = fade < 0.05 ? "none" : "";
    }

    for (let i = 0; i < total; i++) {
      let target;
      if (phase === "scatter") {
        target = scatter[i];
      } else if (phase === "line") {
        const spacing = 78;
        target = {
          x: i * spacing - (total * spacing) / 2,
          y: 0, rotation: 0, scale: 1, opacity: 1,
        };
      } else {
        const c = circlePosition(i, total, g.circleR);
        const a = arcPosition(i, total, {
          radius: g.arcR,
          centerY: g.apexY + g.arcR,
          spread: g.spread,
          offset: 0,
        });
        target = {
          x: lerp(c.x, a.x + parallax, p),
          y: lerp(c.y, a.y, p),
          rotation: lerp(c.rotation, a.rotation, p),
          scale: lerp(1, g.scale, p),
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
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
