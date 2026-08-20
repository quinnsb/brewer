/* image-trail.js
   Vanilla port of the React "fancy" image-trail. As the cursor travels
   across [data-image-trail], each time it moves past a threshold distance
   a new image is dropped at that point and animated out (fade in, hold,
   scale up + fade). Images cycle through the source pool in order.

   The source <img> elements inside the container are read once as a URL
   pool, then removed; every visible image after that is a clone the script
   positions and animates. Lives only on hero-lab.html. */
(function () {
  var trail = document.querySelector("[data-image-trail]");
  if (!trail) return;

  var sources = Array.prototype.slice
    .call(trail.querySelectorAll("img"))
    .map(function (img) { return img.getAttribute("src"); })
    .filter(Boolean);
  trail.innerHTML = "";
  if (!sources.length) return;

  var threshold = parseFloat(trail.getAttribute("data-threshold")) || 80;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  var lastX = null;
  var lastY = null;
  var idx = 0;

  function spawn(x, y) {
    var img = document.createElement("img");
    img.className = "hero-trail-img";
    img.src = sources[idx % sources.length];
    img.alt = "";
    img.style.left = x + "px";
    img.style.top = y + "px";
    trail.appendChild(img);
    idx++;

    // Keyframes mirror the demo: opacity [0,1,1,0] over times
    // [0,.001,.9,1]; scale [1,1,2] over times [0,.8,1]. translate keeps
    // each image centred on the point it was dropped at.
    var anim = img.animate(
      [
        { opacity: 0, transform: "translate(-50%,-50%) scale(1)", offset: 0 },
        { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.001 },
        { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.8 },
        { opacity: 1, transform: "translate(-50%,-50%) scale(1.5)", offset: 0.9 },
        { opacity: 0, transform: "translate(-50%,-50%) scale(2)", offset: 1 }
      ],
      { duration: 2000, easing: "ease-out", fill: "forwards" }
    );
    anim.onfinish = function () { img.remove(); };
  }

  trail.addEventListener("pointermove", function (e) {
    var rect = trail.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    if (lastX === null) {
      lastX = x;
      lastY = y;
      spawn(x, y);
      return;
    }
    if (Math.hypot(x - lastX, y - lastY) > threshold) {
      lastX = x;
      lastY = y;
      spawn(x, y);
    }
  });
})();
