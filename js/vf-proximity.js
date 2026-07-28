/* ============================================================
   LAB — variable-font cursor proximity
   ------------------------------------------------------------
   Vanilla port of the "VariableFontCursorProximity" React effect.
   Each character interpolates its font-variation-settings based on
   how close the cursor is: at the cursor it hits the "to" values,
   at >= radius away it rests at the "from" values.

   Opt in with data-vf-proximity on an element. Knobs (all optional):
     data-vf-radius     px falloff distance          (default 200)
     data-vf-wght-from / data-vf-wght-to   'wght' axis (default 400 -> 900)
     data-vf-slnt-from / data-vf-slnt-to   'slnt' axis (default 0 -> -10)
     data-vf-falloff    easing exponent on the 0..1 ramp
                        (>1 tightens the hotspot, <1 broadens it; default 1)

   Requires a variable font exposing the requested axes (the lab hero
   loads Roboto Flex, which has 'wght' and 'slnt').
   ============================================================ */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function num(value, fallback) {
    var n = parseFloat(value);
    return isNaN(n) ? fallback : n;
  }

  // Replace the element's text with one span per non-space glyph, keeping
  // spaces and <br> so the line still wraps and breaks as authored.
  function splitIntoChars(el) {
    var chars = [];
    var frag = document.createDocumentFragment();
    Array.prototype.forEach.call(el.childNodes, function (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        var text = node.textContent;
        for (var i = 0; i < text.length; i++) {
          var ch = text[i];
          if (ch === " " || ch === "\n" || ch === "\t") {
            frag.appendChild(document.createTextNode(" "));
          } else {
            var span = document.createElement("span");
            span.className = "vf-char";
            span.textContent = ch;
            frag.appendChild(span);
            chars.push(span);
          }
        }
      } else if (node.nodeName === "BR") {
        frag.appendChild(document.createElement("br"));
      } else {
        frag.appendChild(node.cloneNode(true));
      }
    });
    el.textContent = "";
    el.appendChild(frag);
    return chars;
  }

  function settings(wght, slnt) {
    return "'wght' " + wght + ", 'slnt' " + slnt;
  }

  function init(el) {
    var radius = num(el.dataset.vfRadius, 200);
    var wFrom = num(el.dataset.vfWghtFrom, 400);
    var wTo = num(el.dataset.vfWghtTo, 900);
    var sFrom = num(el.dataset.vfSlntFrom, 0);
    var sTo = num(el.dataset.vfSlntTo, -10);
    var falloff = num(el.dataset.vfFalloff, 1);

    var chars = splitIntoChars(el);
    var base = settings(wFrom, sFrom);

    function rest() {
      for (var i = 0; i < chars.length; i++) chars[i].style.fontVariationSettings = base;
    }
    rest();

    // Reduced motion: leave everything at the resting weight, no cursor tracking.
    if (reduceMotion) return;

    var pointerX = null;
    var pointerY = null;
    var queued = false;

    function apply() {
      queued = false;
      if (pointerX === null) return;
      for (var i = 0; i < chars.length; i++) {
        var r = chars[i].getBoundingClientRect();
        var dx = pointerX - (r.left + r.width / 2);
        var dy = pointerY - (r.top + r.height / 2);
        var dist = Math.sqrt(dx * dx + dy * dy);
        var t = 1 - dist / radius;
        if (t < 0) t = 0;
        if (falloff !== 1) t = Math.pow(t, falloff);
        var w = wFrom + (wTo - wFrom) * t;
        var s = sFrom + (sTo - sFrom) * t;
        chars[i].style.fontVariationSettings = settings(w.toFixed(1), s.toFixed(2));
      }
    }

    window.addEventListener(
      "pointermove",
      function (e) {
        pointerX = e.clientX;
        pointerY = e.clientY;
        if (!queued) {
          queued = true;
          requestAnimationFrame(apply);
        }
      },
      { passive: true }
    );

    // Settle back to the resting weight when the cursor leaves the window.
    function reset() {
      pointerX = pointerY = null;
      rest();
    }
    document.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-vf-proximity]"), init);
  }

  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
