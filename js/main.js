/* Brewer — shared interactions */

document.addEventListener("DOMContentLoaded", () => {
  /* ----- menu dock ----- */
  const menuTriggers = [...document.querySelectorAll(".menu-btn")];
  const menuBar = document.querySelector(".menu-bar");
  const dock = document.querySelector(".menu-dock");
  if (menuTriggers.length && dock) {
    const items = dock.querySelectorAll("a, button");
    items.forEach((el, i) => el.style.setProperty("--d", `${0.05 + i * 0.05}s`));
    menuTriggers.forEach((btn) =>
      btn.addEventListener("click", () => document.body.classList.add("menu-open"))
    );
    dock.querySelector(".menu-close")?.addEventListener("click", () =>
      document.body.classList.remove("menu-open")
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") document.body.classList.remove("menu-open");
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

  /* ----- split headlines into words ----- */
  document.querySelectorAll(".split").forEach((el) => {
    // hero headline rises in slowly (~2s); other headlines stagger faster
    const step = el.classList.contains("h-display") ? 0.14 : 0.055;
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    words.forEach((w, i) => {
      const outer = document.createElement("span");
      outer.className = "word";
      const inner = document.createElement("span");
      inner.textContent = w;
      inner.style.setProperty("--wd", `${i * step}s`);
      outer.appendChild(inner);
      el.appendChild(outer);
      el.appendChild(document.createTextNode(" "));
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

  /* ----- back to top ----- */
  document.querySelectorAll(".s-top").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  /* ----- fake multi-step contact form ----- */
  const form = document.querySelector(".form-card form");
  if (form) {
    const steps = [...form.querySelectorAll(".form-step")];
    let current = 0;
    const show = (i) => {
      steps.forEach((s, j) => (s.style.display = j === i ? "block" : "none"));
    };
    show(0);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (current < steps.length - 1) {
        current += 1;
        show(current);
      }
    });
  }
});
