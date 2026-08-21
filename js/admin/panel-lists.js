export async function mount(panel) {
  panel.replaceChildren(Object.assign(document.createElement("p"), {
    className: "admin-placeholder",
    textContent: "Not built yet.",
  }));
}
