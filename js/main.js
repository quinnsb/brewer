/* Brewer — shared interactions */

document.addEventListener("DOMContentLoaded", () => {
  /* ----- menu dock ----- */
  const menuTriggers = [...document.querySelectorAll(".menu-btn")];
  const menuBar = document.querySelector(".menu-bar");
  const dock = document.querySelector(".menu-dock");
  if (menuTriggers.length && dock) {
    const items = dock.querySelectorAll("a, button");
    items.forEach((el, i) => {
      el.style.setProperty("--d", `${0.05 + i * 0.05}s`);
      /* reverse stagger for the close sweep: last pill in, first pill out */
      el.style.setProperty("--dout", `${(items.length - 1 - i) * 0.05}s`);
    });
    let closeTimer;
    const openMenu = () => {
      clearTimeout(closeTimer);
      document.body.classList.remove("menu-closing");
      document.body.classList.add("menu-open");
    };
    const closeMenu = () => {
      if (!document.body.classList.contains("menu-open")) return;
      document.body.classList.remove("menu-open");
      /* keep the dock in place while the pills sweep back out, then drop it */
      document.body.classList.add("menu-closing");
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => document.body.classList.remove("menu-closing"), 700);
    };
    menuTriggers.forEach((btn) => btn.addEventListener("click", openMenu));
    dock.querySelector(".menu-close")?.addEventListener("click", closeMenu);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    /* hide menu chrome near footer */
    const footer = document.querySelector(".site-footer");
    if (footer) {
      const chrome = menuBar ? [...menuTriggers, menuBar] : menuTriggers;
      let footerTicking = false;
      const updateMenuVisibility = () => {
        const footerTop = footer.getBoundingClientRect().top;
        const threshold = window.innerHeight - 120;
        chrome.forEach((el) => el.classList.toggle("near-footer", footerTop <= threshold));
      };
      updateMenuVisibility();
      window.addEventListener(
        "scroll",
        () => {
          if (footerTicking) return;
          footerTicking = true;
          requestAnimationFrame(() => {
            updateMenuVisibility();
            footerTicking = false;
          });
        },
        { passive: true }
      );
      window.addEventListener("resize", updateMenuVisibility, { passive: true });
    }
  }

  /* ----- collapsing wordmark (home hero only) ----- */
  const wordmark = document.querySelector(".logo-wordmark");
  const siteLogo = document.querySelector(".site-logo");
  if (wordmark) {
    if (wordmark.dataset.collapse === "true") {
      wordmark.classList.add("visible");
      let ticking = false;
      window.addEventListener("scroll", () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          wordmark.classList.toggle("visible", window.scrollY < 80);
          ticking = false;
        });
      });
    }
  }

  /* Top-left mark fades out once you leave the opening frame */
  if (siteLogo) {
    let logoTicking = false;
    const updateLogoVisibility = () => {
      siteLogo.classList.toggle("is-scrolled", window.scrollY >= 80);
    };
    updateLogoVisibility();
    window.addEventListener(
      "scroll",
      () => {
        if (logoTicking) return;
        logoTicking = true;
        requestAnimationFrame(() => {
          updateLogoVisibility();
          logoTicking = false;
        });
      },
      { passive: true }
    );
  }

  /* ----- split headlines into words ----- */
  document.querySelectorAll(".split").forEach((el) => {
    // hero headline rises in slowly (~2s); other headlines stagger faster
    const step = el.classList.contains("h-display") ? 0.14 : 0.055;
    // collect words, preserving explicit <br> line breaks as tokens
    const tokens = [];
    el.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent.trim().split(/\s+/).filter(Boolean).forEach((w) => tokens.push(w));
      } else if (node.nodeName === "BR") {
        tokens.push("<br>");
      }
    });
    el.textContent = "";
    let i = 0;
    tokens.forEach((w) => {
      if (w === "<br>") {
        el.appendChild(document.createElement("br"));
        return;
      }
      const outer = document.createElement("span");
      outer.className = "word";
      const inner = document.createElement("span");
      inner.textContent = w;
      inner.style.setProperty("--wd", `${i * step}s`);
      outer.appendChild(inner);
      el.appendChild(outer);
      el.appendChild(document.createTextNode(" "));
      i += 1;
    });
  });

  /* ----- scroll reveals ----- */
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
  );
  // elements marked data-intro-hold are revealed by the intro timeline, not the observer
  document.querySelectorAll(".reveal, .split").forEach((el) => {
    if (el.hasAttribute("data-intro-hold")) return;
    io.observe(el);
  });

  /* ----- homepage load-in sequence: hero text (~2s) → logo drops in ----- */
  const heroSplit = document.querySelector(".hero .h-display.split");
  if (heroSplit && document.documentElement.classList.contains("home-intro")) {
    window.setTimeout(() => {
      document.documentElement.classList.remove("home-intro");
    }, 1750);
  }

  /* Respect reduced-motion preferences while preserving the video as a still. */
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const collegiateVideos = document.querySelectorAll(".ccn-card-video");
  const syncCollegiateVideoMotion = () => {
    collegiateVideos.forEach((video) => {
      if (motionQuery.matches) {
        video.pause();
      } else {
        video.play().catch(() => {});
      }
    });
  };
  syncCollegiateVideoMotion();
  motionQuery.addEventListener?.("change", syncCollegiateVideoMotion);

  /* ----- back to top ----- */
  document.querySelectorAll(".s-top").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  /* ----- case-study browser prototype ----- */
  document.querySelectorAll("[data-site-window]").forEach((windowEl) => {
    const buttons = windowEl.querySelectorAll("[data-browser-view]");
    const screens = windowEl.querySelectorAll("[data-browser-screen]");
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const view = button.dataset.browserView;
        buttons.forEach((item) => item.classList.toggle("is-active", item === button));
        screens.forEach((screen) => screen.classList.toggle("is-active", screen.dataset.browserScreen === view));
      });
    });
  });

  /* ===== M&S mini-site replica interactions (case-study home screen) ===== */
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* rotating hero word: type-on / delete like the production site */
  const rotateTarget = document.querySelector("[data-rotate-word]");
  if (rotateTarget && !prefersReduced) {
    const words = ["technology", "people", "AI", "process"];
    let wi = 0;
    let count = words[0].length;
    let deleting = false;
    const step = () => {
      const word = words[wi];
      const full = count === word.length;
      const empty = count === 0;
      let delay = deleting ? 55 : 85;
      if (!deleting && full) {
        deleting = true;
        delay = 1450;
      } else if (deleting && empty) {
        deleting = false;
        wi = (wi + 1) % words.length;
        delay = 85;
      } else {
        count += deleting ? -1 : 1;
      }
      rotateTarget.textContent = words[wi].slice(0, count);
      window.setTimeout(step, delay);
    };
    window.setTimeout(step, 1450);
  }

  /* "Three ways to engage" tabbed rail */
  const engage = document.querySelector("[data-engage]");
  if (engage) {
    const PHASES = [
      {
        title: "Advisory",
        desc: "We assess where you are, identify the right path forward, and deliver a strategy that works, grounded in decades of delivery experience across government and enterprise.",
        bullets: ["Technology roadmaps", "Architecture review", "Program assessment", "Culture of excellence"],
      },
      {
        title: "Implementation",
        desc: "We embed alongside your team and execute. From enterprise system rollouts to cloud migrations, our consultants are hands-on from kickoff to go-live.",
        bullets: ["Execution and delivery", "Programs and projects", "Full-stack integration", "Outcome accountability"],
      },
      {
        title: "Managed Services",
        desc: "After launch, we stay to run it. Our managed services practice provides continuous operations, optimization, and support, so your team can focus on the mission.",
        bullets: ["Continuous operations", "Service desk support", "Platform optimization", "SLA-backed delivery"],
      },
    ];
    const tabs = engage.querySelectorAll("[data-engage-tab]");
    const panel = engage.querySelector(".msr-engage-panel");
    const ghost = engage.querySelector("[data-engage-ghost]");
    const kicker = engage.querySelector("[data-engage-kicker]");
    const desc = engage.querySelector("[data-engage-desc]");
    const bullets = engage.querySelector("[data-engage-bullets]");
    const render = (i) => {
      const p = PHASES[i];
      const n = `0${i + 1}`;
      ghost.textContent = n;
      kicker.textContent = `${n} / ${p.title.toUpperCase()}`;
      desc.textContent = p.desc;
      bullets.innerHTML = p.bullets.map((b) => `<li>${b}</li>`).join("");
    };
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const i = Number(tab.dataset.engageTab);
        if (tab.classList.contains("is-active")) return;
        tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
        panel.style.opacity = "0";
        window.setTimeout(() => {
          render(i);
          panel.style.opacity = "1";
        }, 160);
      });
    });
  }

  /* testimonial carousel with autoplay + progress bar */
  const quotes = document.querySelector("[data-quotes]");
  if (quotes) {
    const cards = [...quotes.querySelectorAll("blockquote")];
    const progress = quotes.querySelector("[data-quote-progress]");
    const AUTOPLAY = 7000;
    let active = 0;
    let timer;
    const restartProgress = () => {
      if (!progress) return;
      progress.classList.remove("is-running");
      // force reflow so the width transition replays
      void progress.offsetWidth;
      if (!prefersReduced) progress.classList.add("is-running");
    };
    const goTo = (idx) => {
      const next = (idx + cards.length) % cards.length;
      if (next === active) return;
      const prev = cards[active];
      prev.classList.remove("is-active");
      prev.classList.add("is-exiting");
      window.setTimeout(() => prev.classList.remove("is-exiting"), 700);
      cards[next].classList.add("is-active");
      active = next;
      restartProgress();
    };
    const schedule = () => {
      window.clearTimeout(timer);
      if (prefersReduced) return;
      timer = window.setTimeout(() => {
        goTo(active + 1);
        schedule();
      }, AUTOPLAY);
    };
    quotes.querySelector("[data-quote-next]")?.addEventListener("click", () => {
      goTo(active + 1);
      schedule();
    });
    quotes.querySelector("[data-quote-prev]")?.addEventListener("click", () => {
      goTo(active - 1);
      schedule();
    });
    restartProgress();
    schedule();
  }

  /* ----- multi-step contact form: final step posts to Formspree ----- */
  const form = document.querySelector(".form-card form");
  if (form) {
    const steps = [...form.querySelectorAll(".form-step")];
    let current = 0;
    const show = (i) => {
      steps.forEach((s, j) => (s.style.display = j === i ? "block" : "none"));
      steps[i]?.querySelector("input")?.focus();
    };
    const setStatus = (heading, detail, isError = false) => {
      const final = steps[steps.length - 1];
      const icon = final.querySelector(".step:first-child");
      const title = final.querySelector("h3");
      const note = final.querySelector(".step:last-child");
      if (icon) icon.textContent = isError ? "!" : "\u2713";
      if (title) title.textContent = heading;
      if (note) note.textContent = detail;
    };
    show(0);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const activeInputs = [...steps[current].querySelectorAll("input, textarea")];
      const invalidInput = activeInputs.find((input) => !input.checkValidity());
      if (invalidInput) {
        invalidInput.reportValidity();
        return;
      }
      if (current === steps.length - 2) {
        const val = (id) => form.querySelector(`#${id}`)?.value.trim() ?? "";
        const submitButton = steps[current].querySelector("button[type='submit']");
        const originalText = submitButton?.textContent;
        const data = new FormData(form);
        const name = `${val("first")} ${val("last")}`.trim();
        data.set("name", name);
        data.set("_replyto", val("email"));
        data.set("_subject", name ? `Portfolio inquiry from ${name}` : "Portfolio inquiry from Brewer");
        submitButton?.setAttribute("disabled", "true");
        if (submitButton) submitButton.textContent = "Sending...";
        try {
          const response = await fetch(form.action, {
            method: "POST",
            headers: { Accept: "application/json" },
            body: data,
          });
          if (!response.ok) throw new Error("Formspree submission failed");
          form.reset();
          setStatus(
            "Thanks! Your message is on its way, and I'll be in touch within a day or two.",
            "Need to add something else? Email me directly at quinnsb@gmail.com."
          );
        } catch {
          setStatus(
            "Something did not send. Please email me directly instead.",
            "You can reach me at quinnsb@gmail.com.",
            true
          );
        } finally {
          submitButton?.removeAttribute("disabled");
          if (submitButton && originalText) submitButton.textContent = originalText;
        }
      }
      if (current < steps.length - 1) {
        current += 1;
        show(current);
      }
    });
  }

  /* ----- simple Formspree forms ----- */
  document.querySelectorAll("[data-formspree-ajax]").forEach((ajaxForm) => {
    ajaxForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ajaxForm.checkValidity()) {
        ajaxForm.reportValidity();
        return;
      }
      const submit = ajaxForm.querySelector("button[type='submit']");
      const success = document.querySelector("[data-form-success]");
      const error = ajaxForm.querySelector("[data-form-error]");
      const originalText = submit?.dataset.submitLabel || submit?.textContent || "Send";
      submit?.setAttribute("disabled", "true");
      if (submit) submit.textContent = "Sending...";
      if (error) error.hidden = true;
      try {
        const data = new FormData(ajaxForm);
        const sender = String(data.get("email") || "").trim();
        if (sender) data.set("_replyto", sender);
        const response = await fetch(ajaxForm.action, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: data,
        });
        if (!response.ok) throw new Error("Formspree submission failed");
        ajaxForm.reset();
        ajaxForm.hidden = true;
        if (success) success.hidden = false;
      } catch {
        if (error) error.hidden = false;
      } finally {
        submit?.removeAttribute("disabled");
        if (submit) submit.textContent = originalText;
      }
    });
  });
});
