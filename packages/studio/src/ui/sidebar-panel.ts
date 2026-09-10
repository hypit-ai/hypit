import { icon } from "./icons.js";

/** Shared chrome; each view owns its navigation choices, toolbar and content. */
export function createSidebarPanel(mark: string, navigationLabel: string) {
  const element = document.createElement("div");
  element.className = "sidebar-panel";
  element.innerHTML = `
    <div class="sidebar-panel-heading"><span class="sidebar-panel-mark" aria-hidden="true">${icon(mark)}</span></div>
    <div class="sidebar-panel-toolbar"></div>
    <nav class="sidebar-panel-nav"></nav>
    <div class="sidebar-panel-content"></div>`;
  const navigation = element.querySelector<HTMLElement>("nav")!;
  navigation.setAttribute("aria-label", navigationLabel);
  return {
    element, navigation,
    toolbar: element.querySelector<HTMLElement>(".sidebar-panel-toolbar")!,
    content: element.querySelector<HTMLElement>(".sidebar-panel-content")!,
  };
}

export function sidebarItem(input: { label: string; icon: string; selected: boolean; select(): void }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `sidebar-panel-item${input.selected ? " active" : ""}`;
  button.setAttribute("aria-label", input.label);
  button.setAttribute("aria-pressed", String(input.selected));
  button.title = input.label;
  button.innerHTML = icon(input.icon);
  button.addEventListener("click", input.select);
  return button;
}
