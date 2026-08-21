/* Shared navigation behavior for the standalone library pages. */

document.addEventListener("DOMContentLoaded", () => {
  const trigger = document.querySelector("[data-menu-trigger]");
  const dock = document.getElementById("library-menu");
  if (!trigger || !dock) return;

  const closeTargets = document.querySelectorAll("[data-menu-close]");
  const focusable = [...dock.querySelectorAll("a, button")];
  const links = [...dock.querySelectorAll("a")];
  links.forEach((item, index) => {
    item.style.setProperty("--dock-delay", `${0.04 + index * 0.05}s`);
  });

  const open = () => {
    document.body.classList.add("library-menu-open");
    trigger.setAttribute("aria-expanded", "true");
    dock.removeAttribute("inert");
    dock.setAttribute("aria-hidden", "false");
    links[0]?.focus({ preventScroll: true });
  };

  const close = () => {
    if (!document.body.classList.contains("library-menu-open")) return;
    document.body.classList.remove("library-menu-open");
    trigger.setAttribute("aria-expanded", "false");
    dock.setAttribute("aria-hidden", "true");
    dock.setAttribute("inert", "");
    trigger.focus({ preventScroll: true });
  };

  trigger.addEventListener("click", open);
  closeTargets.forEach((target) => target.addEventListener("click", close));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    if (event.key !== "Tab" || !document.body.classList.contains("library-menu-open")) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
});
