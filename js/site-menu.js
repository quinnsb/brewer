/* ============================================================
   SITE MENU — open, close, and the staggered sweep

   One implementation for every page. It used to live inside main.js, which the
   library pages do not load, so they had a second menu that behaved almost but
   not quite the same. Now both load this.

   Everything is guarded on the markup existing, so a page without a menu can
   include it harmlessly.
   ============================================================ */

function wireSiteMenu() {
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireSiteMenu);
} else {
  wireSiteMenu();
}
document.addEventListener("site-menu:mount", wireSiteMenu);
