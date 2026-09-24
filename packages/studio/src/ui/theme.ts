import { uiAttr } from "./i18n.js";
import { setIcon } from "./icons.js";

type Theme = "light" | "dark";
const storageKey = "hypit-studio.theme";
const browser = matchMedia("(prefers-color-scheme: light)");
const root = document.documentElement;
let chosen: Theme | undefined;
try {
  const saved = localStorage.getItem(storageKey);
  if (saved === "light" || saved === "dark") chosen = saved;
} catch { /* Browser storage may be disabled. */ }

const browserTheme = (): Theme => browser.matches ? "light" : "dark";
root.dataset.theme = chosen ?? browserTheme();

export function themeToggle(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button"; button.className = "theme-toggle";
  const render = (): void => {
    const theme = chosen ?? browserTheme();
    root.dataset.theme = theme;
    // The icon names the theme the button switches to.
    setIcon(button, theme === "light" ? "moon" : "sun");
    const label = theme === "light" ? "app.theme-dark" : "app.theme-light";
    uiAttr(button, "title", label); uiAttr(button, "aria-label", label);
  };
  button.addEventListener("click", () => {
    const next: Theme = root.dataset.theme === "light" ? "dark" : "light";
    // Choosing the browser's own theme returns Studio to following the browser.
    chosen = next === browserTheme() ? undefined : next;
    try {
      if (chosen === undefined) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, chosen);
    } catch { /* Tab-local choice still applies. */ }
    render();
  });
  browser.addEventListener("change", render);
  render();
  return button;
}
