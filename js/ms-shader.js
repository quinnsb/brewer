/* Lightweight WebGL shader background for the M&S featured card.
   Renders the animated radial-line shader onto any <canvas class="ms-shader">.
   Dependency-free — no Three.js. Respects reduced-motion and pauses off-screen. */
(function () {
  "use strict";

  var VERT = "attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }";

  var FRAG = [
    "precision highp float;",
    "uniform vec2 resolution;",
    "uniform float time;",
    "uniform float noise;",
    "float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }",
    "void main(void) {",
    "  vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);",
    "  float t = time * 0.05;",
    "  float lineWidth = 0.002;",
    "  vec3 acc = vec3(0.0);",
    "  for (int j = 0; j < 3; j++) {",
    "    for (int i = 0; i < 5; i++) {",
    "      acc[j] += lineWidth * float(i * i) / abs(fract(t - 0.01 * float(j) + float(i) * 0.01) * 5.0 - length(uv) + mod(uv.x + uv.y, 0.2));",
    "    }",
    "  }",
    "  // Map the three animated channels onto a blue palette.",
    "  vec3 deep  = vec3(0.10, 0.25, 0.72);",
    "  vec3 mid   = vec3(0.20, 0.45, 0.95);",
    "  vec3 light = vec3(0.45, 0.78, 1.00);",
    "  vec3 base  = vec3(0.01, 0.02, 0.06);",
    "  vec3 color = base + acc.r * deep + acc.g * mid + acc.b * light;",
    "  // animated film grain",
    "  float g = hash(gl_FragCoord.xy + fract(time)) - 0.5;",
    "  color += g * noise;",
    "  gl_FragColor = vec4(color, 1.0);",
    "}"
  ].join("\n");

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("ms-shader compile error:", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function initCanvas(canvas) {
    var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    var uResolution = gl.getUniformLocation(program, "resolution");
    var uTime = gl.getUniformLocation(program, "time");
    var uNoise = gl.getUniformLocation(program, "noise");

    // grain amount, opt-in per canvas via data-noise="0.2"
    var noiseAmt = parseFloat(canvas.getAttribute("data-noise") || "0") || 0;
    gl.uniform1f(uNoise, noiseAmt);

    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      var w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      var h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uResolution, canvas.width, canvas.height);
    }

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The shader's pattern repeats every PERIOD in `time`, with a lively sweep
    // around the start and a long dark stretch [DARK_START, DARK_END]. Run
    // forward continuously (seamless loop) but crawl through the bright sweep
    // and fast-forward through the dark part so the gap before it comes back
    // around is short.
    var PERIOD = 20.0;
    var DARK_START = 6.5;
    var DARK_END = 19.5;
    var SLOW = 0.011;
    var FAST = 0.075;
    var time = 0.0;
    var raf = null;
    var visible = true;

    function draw() {
      resize();
      gl.uniform1f(uTime, time);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function loop() {
      var p = time % PERIOD;
      var inDark = p > DARK_START && p < DARK_END;
      time += inDark ? FAST : SLOW;
      draw();
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (raf == null) raf = requestAnimationFrame(loop);
    }
    function stop() {
      if (raf != null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    }

    if ("ResizeObserver" in window) {
      new ResizeObserver(function () { resize(); if (reduce || !visible) draw(); }).observe(canvas);
    } else {
      window.addEventListener("resize", function () { resize(); if (reduce || !visible) draw(); });
    }

    if (reduce) {
      // Render a single static frame at the brightest point, no animation.
      time = 3.0;
      resize();
      draw();
      return;
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start(); else stop();
      }, { threshold: 0 }).observe(canvas);
    } else {
      start();
    }
    start();
  }

  function boot() {
    var nodes = document.querySelectorAll("canvas.ms-shader");
    for (var i = 0; i < nodes.length; i++) initCanvas(nodes[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
