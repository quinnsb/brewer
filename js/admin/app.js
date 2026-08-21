/* Admin shell. Decides between the login form and the workspace, owns the tab
   switching, and nothing else. Each panel is its own module. */

import { api } from "./api.js?v=admin1";

const app = document.getElementById("app");
const PANELS = {
  write: () => import("./panel-write.js?v=admin1"),
  add: () => import("./panel-add.js?v=admin1"),
  import: () => import("./panel-import.js?v=admin1"),
  lists: () => import("./panel-lists.js?v=admin1"),
};

function render(templateId) {
  app.replaceChildren(document.getElementById(templateId).content.cloneNode(true));
  app.removeAttribute("aria-busy");
}

function showLogin({ message } = {}) {
  render("tpl-login");
  const form = app.querySelector("[data-login]");
  const error = app.querySelector("[data-error]");
  const submit = app.querySelector("[data-submit]");
  if (message) {
    error.textContent = message;
    error.hidden = false;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    submit.disabled = true;
    submit.textContent = "Checking";
    try {
      await api.login(form.password.value);
      showShell();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      form.password.value = "";
      form.password.focus();
    } finally {
      submit.disabled = false;
      submit.textContent = "Sign in";
    }
  });
}

async function showShell() {
  render("tpl-shell");
  const panel = app.querySelector("[data-panel]");
  const tabs = [...app.querySelectorAll("[data-tab]")];

  async function open(name) {
    for (const tab of tabs) tab.setAttribute("aria-current", String(tab.dataset.tab === name));
    panel.replaceChildren(Object.assign(document.createElement("p"), {
      className: "admin-placeholder",
      textContent: "Loading",
    }));
    try {
      const module = await PANELS[name]();
      await module.mount(panel);
    } catch (err) {
      /* A panel that fails to load should not take the whole admin down with
         it, since the other tabs are still perfectly usable. */
      panel.replaceChildren(Object.assign(document.createElement("p"), {
        className: "admin-error",
        textContent: `Could not open ${name}: ${err.message}`,
      }));
    }
  }

  for (const tab of tabs) tab.addEventListener("click", () => open(tab.dataset.tab));
  app.querySelector("[data-logout]").addEventListener("click", async () => {
    await api.logout().catch(() => {});
    showLogin({ message: "Signed out." });
  });

  open("write");
}

/* A 401 from any panel means the session lapsed while the tab sat open, so the
   whole app drops back to the login form rather than failing in place. */
addEventListener("admin:unauthorized", () => showLogin({ message: "Your session expired. Sign in again." }));

try {
  const { authed } = await api.session();
  if (authed) showShell();
  else showLogin();
} catch (err) {
  render("tpl-login");
  const error = app.querySelector("[data-error]");
  error.textContent = `Cannot reach the server: ${err.message}`;
  error.hidden = false;
}
