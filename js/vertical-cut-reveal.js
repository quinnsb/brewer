(function () {
  "use strict";

  var root = document.documentElement;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var headings = Array.prototype.slice.call(document.querySelectorAll("[data-vertical-cut-reveal]"));
  var replay = document.querySelector("[data-vcr-replay]");
  var longestDuration = 0;

  function buildHeading(heading) {
    var originalText = heading.textContent.replace(/\s+/g, " ").trim();
    var nodes = Array.prototype.slice.call(heading.childNodes);
    var stagger = Number(heading.dataset.vcrStagger) || 22;
    var characterIndex = 0;

    heading.textContent = "";
    heading.setAttribute("aria-label", originalText);

    function appendWord(word) {
      var wordWrap = document.createElement("span");
      wordWrap.className = "vcr-word";
      wordWrap.setAttribute("aria-hidden", "true");

      Array.from(word).forEach(function (character) {
        var clip = document.createElement("span");
        var inner = document.createElement("span");
        clip.className = "vcr-char";
        inner.className = "vcr-char-inner";
        inner.textContent = character;
        inner.style.setProperty("--vcr-delay", characterIndex * stagger + "ms");
        clip.appendChild(inner);
        wordWrap.appendChild(clip);
        characterIndex += 1;
      });

      heading.appendChild(wordWrap);
    }

    nodes.forEach(function (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        var words = node.textContent.trim().split(/\s+/).filter(Boolean);
        words.forEach(function (word, index) {
          appendWord(word);
          if (index < words.length - 1) heading.appendChild(document.createTextNode(" "));
        });
      } else if (node.nodeName === "BR") {
        heading.appendChild(document.createElement("br"));
      }
    });

    heading.classList.add("is-ready");
    longestDuration = Math.max(longestDuration, Math.max(0, characterIndex - 1) * stagger + 820);
  }

  function play() {
    headings.forEach(function (heading) {
      heading.classList.add("is-resetting");
      heading.classList.remove("is-in");
      void heading.offsetWidth;
    });

    if (reducedMotion) {
      headings.forEach(function (heading) { heading.classList.add("is-in"); });
      root.classList.remove("vcr-lab-intro");
      return;
    }

    window.requestAnimationFrame(function () {
      headings.forEach(function (heading) { heading.classList.remove("is-resetting"); });
      window.requestAnimationFrame(function () {
        headings.forEach(function (heading) { heading.classList.add("is-in"); });
      });
    });
  }

  headings.forEach(buildHeading);
  play();

  window.setTimeout(function () {
    root.classList.remove("vcr-lab-intro");
  }, reducedMotion ? 0 : longestDuration);

  replay?.addEventListener("click", play);
})();
