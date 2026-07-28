/* ============================================================
   LAB — theme + font switcher
   Lab tooling. Only homepage-lab.html loads this.

   TO ADD A COLOUR THEME: add an entry to THEMES below, and a
   matching .lab-home[data-lab-theme="<id>"] block in
   css/homepage-lab.css.

   TO ADD A FONT SET: add an entry to FONT_SETS below, a matching
   .lab-home[data-lab-font="<id>"] block in css/homepage-lab.css,
   and — if the family is not already loaded — add it to the
   Google Fonts <link> in homepage-lab.html.

   The two axes are independent: any theme combines with any font
   set. Each remembers its own choice.
   ============================================================ */

(function () {
  "use strict";

  /* "original" is the live site. It has no theme block and no tokens: the
     structural rules are scoped to .lab-themed, and this is the one theme
     that does not get that class, so the production design shows through
     untouched. Anything else added here needs both the class and a block. */
  var ORIGINAL = "original";

  var THEMES = [
    { id: ORIGINAL, label: "Original" },
    { id: "ilm", label: "ILM" },
    { id: "ilm2", label: "ILM 2" },
    { id: "plum", label: "Plum" },
    { id: "graphite", label: "Graphite" },
    { id: "almanac", label: "Almanac" },
    { id: "almanac-dark", label: "Almanac Dark" },
    { id: "carnival", label: "Carnival" },
    { id: "carnival-dark", label: "Carnival Dark" },
    { id: "carnival-charcoal", label: "Carnival Charcoal" }
  ];

  var FONT_SETS = [
    { id: "degular", label: "Degular" },
    { id: "aeonik", label: "Aeonik" },
    { id: "poleno", label: "Poleno" },
    { id: "avantgarde", label: "Avant Garde" },
    { id: "fatfrank", label: "FatFrank" },
    { id: "metallophile", label: "Metallophile" },
    { id: "wisesans", label: "Wise Sans" }
  ];

  /* one row of the switcher per axis */
  var AXES = [
    { legend: "Theme", attr: "data-lab-theme", key: "lab-theme", options: THEMES, fallback: ORIGINAL },
    { legend: "Type", attr: "data-lab-font", key: "lab-font", options: FONT_SETS, fallback: "degular" }
  ];

  var body = document.body;
  if (!body || !body.classList.contains("lab-home")) return;

  /* localStorage throws in private mode on some browsers, and a dead
     switcher is worse than an unremembered one, so both sides are guarded. */
  function read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      /* not fatal — the choice still applies for this page view */
    }
  }

  var bar = document.createElement("div");
  bar.className = "lab-theme-switch";

  /* every axis' dropdown registers here so opening one closes the others
     and an outside click / Escape closes them all */
  var selects = [];

  function closeAll() {
    selects.forEach(function (sel) {
      sel.classList.remove("open");
      if (sel.__trigger) sel.__trigger.setAttribute("aria-expanded", "false");
    });
  }

  AXES.forEach(function (axis) {
    var optButtons = [];

    var row = document.createElement("div");
    row.className = "lab-switch-row";

    var legend = document.createElement("span");
    legend.textContent = axis.legend;
    row.appendChild(legend);

    var select = document.createElement("div");
    select.className = "lab-select";

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "lab-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    var label = document.createElement("span");
    label.className = "lab-select-label";
    trigger.appendChild(label);

    var caret = document.createElement("span");
    caret.className = "lab-select-caret";
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = "▾";
    trigger.appendChild(caret);

    var menu = document.createElement("div");
    menu.className = "lab-select-menu";
    menu.setAttribute("role", "listbox");

    function apply(id, persist) {
      body.setAttribute(axis.attr, id);
      /* the colour axis also gates section 3 of the stylesheet */
      if (axis.key === "lab-theme") {
        body.classList.toggle("lab-themed", id !== ORIGINAL);
      }
      if (persist) write(axis.key, id);
      var current = axis.options.filter(function (o) { return o.id === id; })[0];
      label.textContent = current ? current.label : id;
      optButtons.forEach(function (b) {
        var on = b.dataset.value === id;
        b.setAttribute("aria-selected", String(on));
        b.classList.toggle("is-selected", on);
      });
    }

    axis.options.forEach(function (option) {
      var o = document.createElement("button");
      o.type = "button";
      o.className = "lab-select-option";
      o.setAttribute("role", "option");
      o.dataset.value = option.id;
      o.textContent = option.label;
      o.addEventListener("click", function (e) {
        e.stopPropagation();
        apply(option.id, true);
        closeAll();
        trigger.focus();
      });
      optButtons.push(o);
      menu.appendChild(o);
    });

    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var willOpen = !select.classList.contains("open");
      closeAll();
      if (willOpen) {
        select.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
      }
    });

    select.appendChild(trigger);
    select.appendChild(menu);
    select.__trigger = trigger;
    selects.push(select);

    row.appendChild(select);
    bar.appendChild(row);

    var known = axis.options.some(function (o) { return o.id === read(axis.key); });
    apply(known ? read(axis.key) : axis.fallback, false);
  });

  /* clicking anywhere outside, or pressing Escape, closes any open menu */
  document.addEventListener("click", closeAll);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeAll();
  });

  body.appendChild(bar);
})();
