/* ============================================================
   LIBRARY LAB — three renderers over one data file

   Lab tooling. Only library-lab.html loads this.

   Everything reads data/library.json. That file is the product;
   the renderers are swappable consumers of it. Nothing below
   knows where the metadata came from, which is the point.

   A  css     per-type CSS physics (spine / crate / rack / tile)
   B  webgl   Three.js, one mesh per item, raycast picking
   C  tiered  CSS index + a WebGL hero for starred items
   ============================================================ */

(function () {
  "use strict";

  const DATA_URL = "data/library.json";

  /* Which items get the "depth" treatment in renderer C. In production
     this is an editorial flag on the item, set wherever the writeup is. */
  const STARRED = new Set([
    "book-the-left-hand-of-darkness",
    "book-blood-meridian",
    "album-in-rainbows",
    "album-blue",
    "film-in-the-mood-for-love",
    "film-there-will-be-blood",
  ]);

  const TYPE_LABEL = {
    book: ["Books", "spine shelf · clipped jacket + tinted ground"],
    album: ["Albums", "crate · front-facing, leaned, flip-through"],
    film: ["Films", "poster rack · bottom-aligned bin"],
    other: ["Podcasts", "tiles · square art, no faked physics"],
  };

  const state = { items: [], byType: {}, selected: null };

  /* ---------------------------------------------------------
     shared helpers
     --------------------------------------------------------- */

  const el = (tag, cls, attrs) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  /* Spine width is driven by the deterministic `thickness` from the sync
     script, so a title always sits at the same width across reloads. */
  const spineWidth = (item) => Math.round(15 + item.thickness * 17);
  const spineHeight = (item) => Math.round(210 + item.height * 78);

  function label(text, sub) {
    const l = el("div", "shelf-label");
    l.append(document.createTextNode(text), Object.assign(el("span"), { textContent: sub }));
    return l;
  }

  function showDetail(item, panel) {
    state.selected = item;
    panel.hidden = false;
    const p = item.palette || {};
    panel.innerHTML = "";

    const art = el("div", "detail-art");
    const img = el("img");
    img.src = item.cover;
    img.alt = "";
    art.append(img);

    const body = el("div");
    const h = el("h3");
    h.textContent = item.title;
    const meta = el("p", "meta");
    meta.textContent = [item.creator, item.year, item.detail].filter(Boolean).join(" · ");

    const sw = el("div", "swatches");
    for (const key of ["cover", "accent", "ink"]) {
      if (!p[key]) continue;
      const chip = el("div", "sw");
      chip.style.background = p[key];
      chip.title = `${key} ${p[key]}`;
      sw.append(chip);
    }
    const swLabel = el("span", "swatch-label");
    swLabel.textContent = `${p.cover || ""} ${p.accent || ""}`.trim();
    sw.append(swLabel);

    body.append(h, meta, sw);
    if (item.sourceUrl) {
      const a = el("a", "src", { href: item.sourceUrl, target: "_blank", rel: "noopener" });
      a.textContent = "Source record";
      body.append(a);
    }
    panel.append(art, body);
  }

  /* ---------------------------------------------------------
     RENDERER A — CSS, per-type physics
     --------------------------------------------------------- */

  const BUILDERS = {
    book(item) {
      const w = spineWidth(item);
      const h = spineHeight(item);
      const btn = el("button", "spine", { type: "button", "aria-label": `${item.title} by ${item.creator}` });
      btn.style.setProperty("--spine-w", `${w}px`);
      btn.style.setProperty("--spine-h", `${h}px`);
      /* open width = the jacket at its true aspect ratio */
      btn.style.setProperty("--open-w", `${Math.round(h * item.aspect)}px`);
      btn.style.setProperty("--cover", item.palette?.cover || "#33302b");
      btn.style.setProperty("--ink", item.palette?.ink || "#f1ece3");
      const img = el("img");
      img.src = item.cover; img.alt = ""; img.loading = "lazy";
      const t = el("span", "spine-title");
      t.textContent = item.title;
      btn.append(img, t);
      return btn;
    },
    album(item) {
      const btn = el("button", "sleeve", { type: "button", "aria-label": `${item.title} by ${item.creator}` });
      btn.style.setProperty("--cover", item.palette?.cover || "#33302b");
      const img = el("img");
      img.src = item.cover; img.alt = ""; img.loading = "lazy";
      btn.append(img);
      return btn;
    },
    film(item) {
      const btn = el("button", "poster", { type: "button", "aria-label": `${item.title}, ${item.year || ""}` });
      btn.style.setProperty("--cover", item.palette?.cover || "#33302b");
      /* deterministic lean from the id so the rack looks handled, not tidy */
      const lean = ((item.id.length * 7) % 5) - 2;
      btn.style.setProperty("--lean", `${lean}deg`);
      const img = el("img");
      img.src = item.cover; img.alt = ""; img.loading = "lazy";
      btn.append(img);
      return btn;
    },
    other(item) {
      const btn = el("button", "tile", { type: "button", "aria-label": item.title });
      btn.style.setProperty("--cover", item.palette?.cover || "#33302b");
      const img = el("img");
      img.src = item.cover; img.alt = ""; img.loading = "lazy";
      btn.append(img);
      return btn;
    },
  };

  const CONTAINER = {
    book: () => {
      const rail = el("div", "shelf-rail");
      const shelf = el("div", "spine-shelf", { role: "list", "data-labels": "off" });
      rail.append(shelf);
      return { rail, mount: shelf };
    },
    album: () => {
      /* crate = scroll viewport > box (floor/lip/wall) > inner (the records) */
      const crate = el("div", "crate", { role: "list", "data-mode": "lean" });
      const box = el("div", "crate-box");
      const inner = el("div", "crate-inner");
      box.append(inner); crate.append(box);
      return { rail: crate, mount: inner };
    },
    film: () => {
      const rail = el("div", "shelf-rail");
      const rack = el("div", "rack", { role: "list" });
      rail.append(rack);
      return { rail, mount: rack };
    },
    other: () => {
      const wrap = el("div");
      const tiles = el("div", "tiles", { role: "list" });
      wrap.append(tiles);
      return { rail: wrap, mount: tiles };
    },
  };

  function buildCssRenderer(root, panel) {
    root.innerHTML = "";
    for (const type of ["book", "album", "film", "other"]) {
      const items = state.byType[type] || [];
      if (!items.length) continue;

      const block = el("section", "shelf-block");
      const [name, sub] = TYPE_LABEL[type];
      block.append(label(name, sub));

      const { rail, mount } = CONTAINER[type]();
      for (const item of items) {
        const node = BUILDERS[type](item);
        node.setAttribute("role", "listitem");
        node.addEventListener("click", () => {
          mount.querySelectorAll(".is-open").forEach((n) => n.classList.remove("is-open"));
          node.classList.add("is-open");
          showDetail(item, panel);
        });
        mount.append(node);
      }
      block.append(rail);
      root.append(block);
    }
  }

  /* ---------------------------------------------------------
     RENDERER B — WebGL
     Deliberately simplified. The reference implementations run
     ~2,200 (complete-shelf) and ~11,400 (side-one) lines for
     seven items each; this is a few hundred for twenty-eight.
     It tests the feel, not the craft ceiling.
     --------------------------------------------------------- */

  const GL = {
    ready: false, THREE: null, renderer: null, scene: null, camera: null,
    meshes: [], raycaster: null, pointer: null, target: 0, current: 0,
    focus: null, stage: null, panel: null, raf: 0,
  };

  /* Box faces are ordered [+x, -x, +y, -y, +z, -z].
     A book stands with its spine toward the camera, so the art lives on
     +x and the mesh rotates a quarter turn when it is pulled out. */
  function meshDims(item) {
    if (item.type === "book") return [0.16 + item.thickness * 0.16, 1.5 * item.height, 1.0];
    if (item.type === "album") return [1.5, 1.5, 0.06];
    if (item.type === "film") return [1.05, 1.05 / item.aspect, 0.05];
    return [1.2, 1.2, 0.08];
  }

  /* Bake a spine face from the item's own palette + type.
     This is the technique borrowed from complete-shelf, and it is what
     makes objects with no printed spine (records, most films) work on a
     shelf at all. Cover art stays primary; this only fills the edge. */
  function bakeSpine(THREE, item) {
    const W = 160, H = 1024;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const p = item.palette || {};

    g.fillStyle = p.cover || "#33302b";
    g.fillRect(0, 0, W, H);

    /* cloth grain, so the spine is not a flat fill */
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
      g.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }
    /* board edges */
    const edge = g.createLinearGradient(0, 0, W, 0);
    edge.addColorStop(0, "rgba(255,255,255,.20)");
    edge.addColorStop(0.12, "rgba(0,0,0,0)");
    edge.addColorStop(0.88, "rgba(0,0,0,0)");
    edge.addColorStop(1, "rgba(0,0,0,.45)");
    g.fillStyle = edge; g.fillRect(0, 0, W, H);

    /* accent rules top and bottom, foil-style */
    g.fillStyle = p.accent || "#9a8f7d";
    g.fillRect(W * 0.22, H * 0.055, W * 0.56, 5);
    g.fillRect(W * 0.22, H * 0.945, W * 0.56, 5);

    /* title, set vertically in the site face */
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(-Math.PI / 2);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = p.ink || "#f1ece3";
    let size = 62;
    const max = H * 0.74;
    const title = item.title.toUpperCase();
    do {
      g.font = `600 ${size}px "Degular Display", system-ui, sans-serif`;
      size -= 2;
    } while (g.measureText(title).width > max && size > 20);
    g.fillText(title, 0, 0);
    g.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  async function initGL(stage, panel) {
    GL.stage = stage; GL.panel = panel;
    let THREE;
    try {
      THREE = await import("https://unpkg.com/three@0.169.0/build/three.module.js");
    } catch (err) {
      stage.innerHTML = `<div class="gl-fallback">Three.js failed to load.<br>${err.message}</div>`;
      return;
    }
    GL.THREE = THREE;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    stage.append(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, stage.clientWidth / stage.clientHeight, 0.1, 100);
    camera.position.set(0, 0.25, 7.2);

    scene.add(new THREE.HemisphereLight(0xf1ece3, 0x2a2620, 2.1));
    const key = new THREE.DirectionalLight(0xfff3e2, 2.0);
    key.position.set(3, 5, 6);
    scene.add(key);

    const loader = new THREE.TextureLoader();
    const meshes = [];
    let x = 0;

    for (const item of state.items) {
      const [w, h, d] = meshDims(item);
      const ground = new THREE.Color(item.palette?.cover || "#33302b");
      const side = new THREE.MeshStandardMaterial({ color: ground, roughness: 0.86, metalness: 0.02 });

      const tex = loader.load(item.cover);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const art = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.03 });

      /* books show a baked spine to camera and hide the jacket on +x until
         they are pulled out; everything else shows its art face-on */
      const mats = item.type === "book"
        ? (() => {
            const spine = new THREE.MeshStandardMaterial({
              map: bakeSpine(THREE, item), roughness: 0.9, metalness: 0.02,
            });
            return [art, side.clone(), side.clone(), side.clone(), spine, side.clone()];
          })()
        : [side.clone(), side.clone(), side.clone(), side.clone(), art, side.clone()];

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      mesh.position.set(x + w / 2, h / 2 - 1.1, 0);
      mesh.userData.item = item;
      mesh.userData.homeY = mesh.position.y;
      mesh.userData.homeZ = 0;
      scene.add(mesh);
      meshes.push(mesh);
      x += w + (item.type === "book" ? 0.015 : 0.16);
    }

    /* shelf line */
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(x + 4, 0.08, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x2b2723, roughness: 0.95 })
    );
    rail.position.set(x / 2, -1.14, 0);
    scene.add(rail);

    Object.assign(GL, {
      ready: true, renderer, scene, camera, meshes,
      raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2(),
      span: x, target: 0, current: 0,
    });

    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("pointerdown", () => stage.focus?.());
    stage.addEventListener("click", onClick);
    animate();
  }

  /* A canvas that swallows every wheel event traps the page: scrolling
     past the shelf moves the shelf instead of the document. Horizontal
     intent always drives the shelf; vertical intent only drives it while
     there is shelf left to travel, and otherwise falls through to the page. */
  function onWheel(e) {
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    const delta = horizontal ? e.deltaX : e.deltaY;
    const max = Math.max(0, GL.span - 3);
    const next = GL.target + delta * 0.01;

    if (!horizontal && ((next <= 0 && delta < 0) || (next >= max && delta > 0))) {
      return; /* at an end: let the page scroll */
    }
    e.preventDefault();
    GL.target = Math.max(0, Math.min(max, next));
  }

  function onClick(e) {
    if (!GL.ready) return;
    const r = GL.renderer.domElement.getBoundingClientRect();
    GL.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    GL.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    GL.raycaster.setFromCamera(GL.pointer, GL.camera);
    const hit = GL.raycaster.intersectObjects(GL.meshes, false)[0];
    if (!hit) return;
    GL.focus = GL.focus === hit.object ? null : hit.object;
    if (GL.focus) showDetail(GL.focus.userData.item, GL.panel);
  }

  function animate() {
    GL.raf = requestAnimationFrame(animate);
    /* damped virtual scroll; no DOM scrollbar involved */
    GL.current += (GL.target - GL.current) * 0.09;
    GL.camera.position.x = GL.current + 2.1;
    GL.camera.lookAt(GL.current + 2.1, -0.1, 0);

    for (const m of GL.meshes) {
      const focused = m === GL.focus;
      const isBook = m.userData.item.type === "book";
      const wantZ = focused ? 1.5 : m.userData.homeZ;
      const wantY = focused ? m.userData.homeY + 0.5 : m.userData.homeY;
      const wantRot = focused && isBook ? -Math.PI / 2 : 0;
      m.position.z += (wantZ - m.position.z) * 0.1;
      m.position.y += (wantY - m.position.y) * 0.1;
      m.rotation.y += (wantRot - m.rotation.y) * 0.1;
    }
    GL.renderer.render(GL.scene, GL.camera);
  }

  /* ---------------------------------------------------------
     boot
     --------------------------------------------------------- */

  function groupByType(items) {
    const by = {};
    for (const it of items) (by[it.type] ||= []).push(it);
    return by;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const res = await fetch(DATA_URL);
    const db = await res.json();
    state.items = db.items;
    state.byType = groupByType(db.items);

    for (const it of state.items) it.starred = STARRED.has(it.id);

    const cssRoot = document.getElementById("r-css");
    const cssPanel = document.getElementById("d-css");
    buildCssRenderer(cssRoot, cssPanel);

    /* spine label toggle */
    document.getElementById("toggle-labels")?.addEventListener("change", (e) => {
      cssRoot.querySelectorAll(".spine-shelf").forEach((s) => {
        s.dataset.labels = e.target.checked ? "on" : "off";
      });
    });

    /* crate physics toggle — lean vs face-on stack */
    document.getElementById("crate-mode")?.addEventListener("change", (e) => {
      cssRoot.querySelectorAll(".crate").forEach((c) => { c.dataset.mode = e.target.value; });
    });

    /* sort control — proves the ordering lives in the data layer */
    document.getElementById("sort")?.addEventListener("change", (e) => {
      const key = e.target.value;
      const cmp = {
        default: () => 0,
        title: (a, b) => a.title.localeCompare(b.title),
        creator: (a, b) => a.creator.localeCompare(b.creator),
        year: (a, b) => (b.year || 0) - (a.year || 0),
      }[key];
      for (const list of Object.values(state.byType)) list.sort(cmp);
      buildCssRenderer(cssRoot, cssPanel);
      cssPanel.hidden = true;
    });

    /* tabs */
    const tabs = [...document.querySelectorAll(".lab-tab")];
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => {
          const on = t === tab;
          t.setAttribute("aria-selected", String(on));
          document.getElementById(t.dataset.panel).hidden = !on;
        });
        if (tab.dataset.panel === "p-webgl" && !GL.ready) {
          initGL(document.getElementById("gl-stage"), document.getElementById("d-gl"));
        }
        if (tab.dataset.panel === "p-tiered") buildTiered();
      });
    });

    /* ---------- RENDERER C — tiered ---------- */
    function buildTiered() {
      const root = document.getElementById("r-tiered");
      if (root.dataset.built) return;
      root.dataset.built = "1";
      const panel = document.getElementById("d-tiered");

      const starred = state.items.filter((i) => i.starred);
      const rest = state.items.filter((i) => !i.starred);

      const top = el("section", "shelf-block");
      top.append(label("Starred", `${starred.length} items · depth tier, dimensional`));
      const { rail, mount } = CONTAINER.film();
      for (const item of starred) {
        const node = BUILDERS.film(item);
        node.addEventListener("click", () => showDetail(item, panel));
        mount.append(node);
      }
      top.append(rail);

      const bottom = el("section", "shelf-block");
      bottom.append(label("Everything else", `${rest.length} items · breadth tier, flat`));
      const shelf = el("div", "spine-shelf", { "data-labels": "off" });
      for (const item of rest) {
        const node = BUILDERS.book({ ...item, aspect: item.aspect });
        node.addEventListener("click", () => showDetail(item, panel));
        shelf.append(node);
      }
      const r2 = el("div", "shelf-rail");
      r2.append(shelf);
      bottom.append(r2);

      root.innerHTML = "";
      root.append(top, bottom);
    }
  });
})();
