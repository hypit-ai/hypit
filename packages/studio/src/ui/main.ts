import { bindDropdown } from "./dropdown.js";
import { uiLabel, uiAttribute, uiText, uiAttr, userText, languageMenu, initializeI18n, type Message } from "./i18n.js";
import type { StudioItem, StudioItemAddress, StudioFailure, StudioInspectorDomain, StudioMutation, StudioSnapshot } from "../shared.js";
import { sameStudioTrackAddress, studioItemAddressKey } from "../shared.js";
import type { CanonicalValue, ValueSchema } from "@hypit/hypit/protocol";
import type { StudioValuePresentation } from "@hypit/studio-companion";
import { parameterAuthorValue, parameterControlForPresentation, parameterControlForSchema, parameterNumber, parameterOption, parameterRecordSchema, parameterRecordVariants, validateParameterValue } from "../parameter-values.js";
import { createCodePane } from "./code.js";
import { icon } from "./icons.js";
import { createLibraryPane } from "./library.js";
import { createHandle } from "./resize.js";
import type { Highlight } from "./code.js";
import { domainItemAtOffset, spanAtOffset } from "./markers.js";
import { itemAtOffset, createStore } from "./selection.js";
import { createStage } from "./stage.js";
import { domainGestureSpan } from "../temporal-edit.js";
import type { DomainTarget } from "../temporal-edit.js";
import { applyStudioMutation } from "./writeback.js";
import { createTimeline } from "./timeline.js";
import { createComments } from "./comments.js";
import { themeToggle } from "./theme.js";
import "../style.css";

await initializeI18n();

const app = document.querySelector<HTMLElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand" aria-label="Hypit">
      <span class="brand-mark" aria-hidden="true">
        <svg class="brand-symbol" viewBox="50 180 262 234" preserveAspectRatio="xMidYMid meet">
          <path fill="currentColor" d="M303.78,277.82c-5.98-8.63-15.83-13.77-26.32-13.77h-93.41c-12.28,0-24.92,7.44-29.6,18.8l-28.26,75.82c-4.6,11.25-4.54,24.05,2.22,34.16,6.79,10.15,19.36,16.15,31.57,16.15h85.98c14.12,0,26.9-8.88,31.84-22.1l29.69-79.57c3.67-9.84,2.29-20.86-3.69-29.48v-.02h-.02ZM252.02,377.25c-.94,2.52-3.39,4.22-6.08,4.22h-83.45c-4.34,0-6.68-2.8-7.49-3.99s-2.5-4.43-.84-8.44l23.85-66.24c2.29-6.35,8.08-10.87,14.82-11.22.33-.02.67-.02,1.02-.02h75.41s12.51,1.42,9.29,14.61l-26.53,71.09h0ZM106.85,361.73s-22.36-11.59-17.66-32.66l29.67-82.23c4.78-13.25,17.36-22.09,31.45-22.09h95.02c6.25,0,12.1,3.03,15.71,8.14l13.89,19.68h-112.97c-8.7,0-16.49,5.41-19.52,13.57l-35.59,95.6h0ZM73.3,323.27s-22.37-11.59-17.66-32.66l29.67-82.23c4.79-13.25,17.37-22.09,31.45-22.09h89.91c6.25,0,12.1,3.03,15.71,8.14l13.89,19.68h-107.84c-8.7,0-16.49,5.41-19.52,13.57l-35.59,95.6h-.02Z"/>
        </svg>
        <svg class="brand-wordmark" viewBox="370 228 422 180" preserveAspectRatio="xMinYMid meet">
          <g fill="currentColor">
            <rect x="692.47" y="276.19" width="19.22" height="90.09" rx="4.12" ry="4.12"/>
            <path d="M462.31,293.32c-4.51-11.11-12.93-15.68-28.26-17.66-15.52-2-31.17,1.58-36.41,2.96v-38.42c0-2.22-1.8-4.02-4.02-4.02h-11.19c-2.22,0-4.02,1.8-4.02,4.02v123.26c0,2.22,1.8,4.02,4.02,4.02h11.19c2.22,0,4.02-1.8,4.02-4.02v-66.25c3.68-1.46,16.84-6.13,30.89-4.57,12.12,1.35,15.81,10.13,16.92,14.75.32,1.33.47,2.68.47,4.03v53.36c0,1.49,1.2,2.68,2.68,2.68h13.65c1.49,0,2.68-1.2,2.68-2.68v-57.38c0-4.82-.82-9.63-2.63-14.09h.01Z"/>
            <path d="M568.55,346.34v-67.42c0-1.57-1.27-2.85-2.85-2.85h-14.66c-1.57,0-2.85,1.27-2.85,2.85v64.51c0,.58-.19,1.16-.58,1.6-1.62,1.88-7.33,6.23-25.19,5.92-2.22.05-6.37-.58-8.51-1.13-14.03-3.61-12.62-17.41-12.62-33.16v-37.73c0-1.57-1.27-2.85-2.85-2.85h-13.68c-1.57,0-2.85,1.27-2.85,2.85v57.63s-2.72,24.49,25.91,30.92c0,0,3.11.67,7.45,1.01h-.02s.13,0,.38.03c.07,0,.15,0,.23.02.19.02.42.02.69.04.25.02.51.02.77.04,2.94.14,8.59.25,14.08-.44h-.05c6.97-.77,13.42-2.51,17.37-5.02,0,0-1.77,20.45-18.82,23.73-9.86,1.13-24.24-.46-31.62-1.65-2.22-.36-4.33,1.06-4.84,3.24l-2.55,10.92c-.49,2.08.99,4.09,3.1,4.28,7.44.63,23.6,1.84,34.54,1.37,14.62-.61,26.8-6.24,34.06-21.17,7.26-14.93,5.93-37.54,5.93-37.54h.03Z"/>
            <path d="M674.19,297.63c-8.46-21.2-28.09-21.76-37.64-22.58-7.78-.66-37.08.93-47.69,1.54-2.17.13-3.86,1.92-3.86,4.1v119.88c0,1.74,1.41,3.14,3.14,3.14h14.17c1.74,0,3.14-1.41,3.14-3.14v-34.16c45.01,4.23,52.91-1.5,60.82-8.86,8.8-8.2,15.13-37.91,7.91-59.92h.01ZM656.46,330.82c-.27,4.64-1.91,18-19.5,19.22-17.59,1.23-31.5-2.32-31.5-2.32v-54.21c4.62-.18,16.65-.61,25.09-.61,10.64,0,15.27,1.5,21.82,8.32s4.37,24.96,4.09,29.59h0Z"/>
            <path d="M784.34,292.92c1.41,0,2.56-1.15,2.56-2.56v-11.6c0-1.41-1.15-2.56-2.56-2.56h-27.3v-19.11c0-1.32-1.07-2.38-2.38-2.38h-14.87c-1.32,0-2.38,1.07-2.38,2.38v19.11h-10.74c-1.41,0-2.56,1.15-2.56,2.56v11.6c0,1.41,1.15,2.56,2.56,2.56h10.74v48.61c0,14.46,11.72,26.19,26.19,26.19h19.46c2.13,0,3.86-1.73,3.86-3.86v-9.69c0-2.13-1.73-3.86-3.86-3.86h-13.53c-6.9,0-12.48-5.59-12.48-12.48v-44.92h27.3-.01Z"/>
          </g>
          <circle fill="#e83f5f" cx="703.1" cy="250.37" r="14.18"/>
        </svg>
      </span>
    </div>
    <div class="project-title" data-project></div>
    <div class="topbar-right">
      <div class="meta" data-meta></div>
      <div class="status" data-status></div>
      <div data-language-menu></div>
      <div data-theme-toggle></div>
      <div class="view-tabs" role="tablist" ${uiAttribute("aria-label", "app.studio-view")}>
        <button type="button" role="tab" data-view="studio" aria-selected="true">${icon("studio")}${uiLabel("app.studio")}</button>
        <button type="button" role="tab" data-view="comments" aria-selected="false">${icon("comments")}${uiLabel("app.comments")}</button>
      </div>
    </div>
  </header>
  <main class="studio-shell">
    <section class="upper-shell">
      <aside class="source-panel" data-library></aside>
      <div class="preview-panel" data-stage></div>
      <aside class="workspace-panel">
        <div class="pane-heading workspace-heading" data-workspace-heading>
          <div class="pane-title">${icon("tune")}<h2>${uiLabel("inspector.properties")}</h2></div>
          <div class="inspector-session-actions" data-inspector-session-actions></div>
          <div class="inspector-domain-tabs" data-inspector-domain-tabs></div>
        </div>
        <div class="workspace-scroll">
          <section class="workspace-section">
            <div class="inspector" data-inspector></div>
          </section>
        </div>
      </aside>
    </section>
    <div class="timeline-panel" data-timeline></div>
  </main>
  <pre class="failure" data-failure></pre>`;

app.querySelector("[data-language-menu]")!.replaceWith(languageMenu());
app.querySelector("[data-theme-toggle]")!.replaceWith(themeToggle());

const store = createStore();
const code = createCodePane();
const stage = createStage(store, (id) => library.selectArtifact(id));
const library = createLibraryPane(code, (artifact) => stage.openArtifact(artifact), (artifact) => stage.renameArtifact(artifact));
const timeline = createTimeline(store);
const comments = createComments(store, stage);
app.querySelector<HTMLElement>("[data-library]")!.append(library.element);
app.querySelector<HTMLElement>("[data-timeline]")!.append(timeline.element);
app.querySelector<HTMLElement>("[data-stage]")!.append(stage.element);

// The source, picture, workspace and timeline all need different amounts of
// room for different jobs, so each boundary is draggable and remembered.
const shell = app.querySelector<HTMLElement>(".studio-shell")!;
const upperShell = app.querySelector<HTMLElement>(".upper-shell")!;
const workspacePanel = app.querySelector<HTMLElement>(".workspace-panel")!;
const sidebarMinimum = 320;
const sourceHandle = createHandle({
  axis: "column", initial: 416, minimum: sidebarMinimum,
  maximum: () => Math.max(360, upperShell.clientWidth - 720),
  apply: (size) => { upperShell.style.setProperty("--source-width", `${size}px`); },
  remember: "hypit-studio.v3.source-width",
});
sourceHandle.classList.add("source-handle");
upperShell.insertBefore(sourceHandle, app.querySelector<HTMLElement>("[data-stage]")!);
const workspaceHandle = createHandle({
  axis: "column", initial: Math.round(window.innerWidth * 0.22), minimum: sidebarMinimum, invert: true,
  maximum: () => Math.max(320, upperShell.clientWidth - 680),
  apply: (size) => { upperShell.style.setProperty("--workspace-width", `${size}px`); },
  remember: "hypit-studio.v3.workspace-width",
});
workspaceHandle.classList.add("workspace-handle");
upperShell.insertBefore(workspaceHandle, workspacePanel);
const commentsHandle = createHandle({
  axis: "column", initial: 360, minimum: 280, invert: true,
  maximum: () => Math.max(280, upperShell.clientWidth - 360),
  apply: (size) => { upperShell.style.setProperty("--comments-width", `${size}px`); },
  remember: "hypit-studio.comments-width",
});
commentsHandle.classList.add("comments-handle");
upperShell.append(commentsHandle, comments.element);
shell.insertBefore(createHandle({
  axis: "row", initial: Math.round(window.innerHeight * 0.45), minimum: 220, invert: true,
  maximum: () => Math.max(260, shell.clientHeight - 260),
  apply: (size) => { shell.style.setProperty("--timeline-height", `${size}px`); },
  remember: "hypit-studio.v3.timeline-height",
}), app.querySelector<HTMLElement>("[data-timeline]")!);
const inspector = app.querySelector<HTMLElement>("[data-inspector]")!;
const workspaceHeading = app.querySelector<HTMLElement>("[data-workspace-heading]")!;
const inspectorSessionActions = app.querySelector<HTMLElement>("[data-inspector-session-actions]")!;
const inspectorDomainTabs = app.querySelector<HTMLElement>("[data-inspector-domain-tabs]")!;
const meta = app.querySelector<HTMLElement>("[data-meta]")!;
const project = app.querySelector<HTMLElement>("[data-project]")!;
const status = app.querySelector<HTMLElement>("[data-status]")!;
const failureView = app.querySelector<HTMLElement>("[data-failure]")!;

const changeView = (): void => {
  const current = window.location.hash === "#comments" ? "comments" : "studio";
  shell.dataset.view = current;
  app.querySelectorAll<HTMLButtonElement>(".view-tabs [data-view]").forEach((button) => {
    const selected = button.dataset.view === current;
    button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1;
  });
  comments.activate(current === "comments");
};
app.querySelectorAll<HTMLButtonElement>(".view-tabs [data-view]").forEach((button) => {
  button.addEventListener("click", () => { window.location.hash = button.dataset.view!; });
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const next = button.dataset.view === "studio" ? "comments" : "studio";
    window.location.hash = next;
    app.querySelector<HTMLButtonElement>(`.view-tabs [data-view="${next}"]`)!.focus();
  });
});
window.addEventListener("hashchange", changeView);
changeView();

timeline.element.addEventListener("studio:write", (event) => {
  const state = (event as CustomEvent<{ readonly state?: string }>).detail.state;
  status.className = state === "error" ? "status error" : state === "saved" ? "status saved" : "status saving";
  uiText(status, state === "error" ? "common.save-failed" : state === "saved" ? "common.saved" : "common.saving");
});

// Program-level facts never change while a Source is being read, so they live in
// the header rather than taking a panel that would have to sit over something.
function renderMeta(snapshot: StudioSnapshot): void {
  project.textContent = snapshot.source.path.split(/[\\/]/u).at(-1) ?? snapshot.source.path;
  project.title = snapshot.source.path;
  // Sequence facts belong to the project/inspector, not the application chrome.
  // The timeline transport is the single persistent time readout.
  userText(meta, "");
}

function property(label: Message, value: string, tone?: string): HTMLElement {
  const node = document.createElement("div");
  node.className = `property${tone === undefined ? "" : ` ${tone}`}`;
  node.innerHTML = "<span></span><strong></strong>";
  uiText(node.querySelector("span")!, label);
  node.querySelector("strong")!.textContent = value;
  node.querySelector("strong")!.title = value;
  return node;
}

function group(label: string, items: readonly HTMLElement[], className = ""): HTMLElement {
  const node = document.createElement("section");
  node.className = `property-group${className.length === 0 ? "" : ` ${className}`}`;
  const heading = document.createElement("h3");
  heading.textContent = label;
  const content = document.createElement("div");
  content.className = "property-grid";
  content.append(...items);
  node.append(heading, content);
  return node;
}

function uiGroup(label: Message, items: readonly HTMLElement[]): HTMLElement {
  const node = group(label, items);
  uiText(node.querySelector("h3")!, label);
  return node;
}

function aspectRatio(width: number, height: number): string {
  let a = width;
  let b = height;
  while (b !== 0) [a, b] = [b, a % b];
  return `${width / a}:${height / a}`;
}

const domainPresentation: Readonly<Record<StudioInspectorDomain, { readonly label: Message; readonly icon: string }>> = {
  where: { label: "inspector.where", icon: "where" },
  how: { label: "inspector.how", icon: "how" },
  when: { label: "inspector.when", icon: "when" },
};
const domainOrder: readonly StudioInspectorDomain[] = ["where", "when", "how"];
const inspectorDomainByItem = new Map<string, StudioInspectorDomain>();
const inspectorPageByItem = new Map<string, string>();

function defaultWorkspaceHeading(): void {
  inspectorSessionActions.replaceChildren();
  inspectorDomainTabs.replaceChildren();
  workspaceHeading.classList.remove("has-inspector-domains");
}

function previewParticipation(item: StudioItem): void {
  inspectorSessionActions.replaceChildren();
  if (!item.terminalTargets.some((target) => target.kind === "visual-adjustment")) return;
  const included = !store.current()?.preview.omittedItemKeys.has(studioItemAddressKey(item.address));
  const button = document.createElement("button");
  button.type = "button";
  button.className = `inspector-preview-participation${included ? " active" : ""}`;
  button.setAttribute("aria-pressed", String(included));
  button.innerHTML = `${icon("eye")}<span>${uiLabel("inspector.include-in-preview")}</span>`;
  button.addEventListener("click", () => store.setItemPreviewIncluded(item.address, !included));
  inspectorSessionActions.append(button);
}

function inspectorHeading(
  item: StudioItem,
  domains: readonly StudioInspectorDomain[],
  active: StudioInspectorDomain,
  select: (domain: StudioInspectorDomain) => void,
): void {
  defaultWorkspaceHeading();
  previewParticipation(item);
  workspaceHeading.classList.toggle("has-inspector-domains", domains.length > 0);
  inspectorDomainTabs.replaceChildren(...domains.map((domain) => {
    const presentation = domainPresentation[domain];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `inspector-domain-tab${domain === active ? " active" : ""}`;
    button.dataset.domain = domain;
    button.innerHTML = `${icon(presentation.icon)}<strong>${uiLabel(presentation.label)}</strong>`;
    button.setAttribute("aria-pressed", String(domain === active));
    button.addEventListener("click", () => {
      inspectorDomainByItem.set(studioItemAddressKey(item.address), domain);
      select(domain);
    });
    return button;
  }));
}

function sameValue(left: CanonicalValue, right: CanonicalValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function textValue(value: CanonicalValue): string {
  return typeof value === "string" ? value : value === null ? "" : String(value);
}

type ParameterOwner = Extract<StudioMutation, { readonly type: "parameter.adjust" }>["owner"];

function restoreParameterControls(): void {
  const current = store.current();
  if (current?.selection.kind === "item") {
    renderInspector(current.snapshot, current.selection.item);
  }
}

function commitControl(owner: ParameterOwner, parameter: StudioItem["inspector"][number], replacement: CanonicalValue): void {
  try {
    if (sameValue(parameterAuthorValue(parameter, replacement), parameter.value)) return;
    void writeParameter(owner, parameter, replacement);
  } catch (error) {
    restoreParameterControls();
    uiText(status, "common.invalid-value"); status.className = "status error";
    status.title = error instanceof Error ? error.message : String(error);
  }
}

let openColorPicker: {
  readonly root: HTMLElement;
  readonly close: () => void;
} | undefined;

document.addEventListener("click", (event) => {
  if (openColorPicker === undefined || !(event.target instanceof Node)) return;
  if (!openColorPicker.root.contains(event.target)) openColorPicker.close();
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || openColorPicker === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  openColorPicker.close();
}, true);

function selectControl(
  parameter: StudioItem["inspector"][number],
  change: (value: CanonicalValue) => void,
): HTMLElement {
  const control = document.createElement("div");
  control.className = "parameter-select parameter-control";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "parameter-select-trigger";
  trigger.setAttribute("aria-label", parameter.label);
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const selected = document.createElement("span");
  selected.className = "parameter-select-value";
  const choices = (parameter.options ?? []).map(parameterOption);
  if (choices.some(option => option.description || option.preview)) control.classList.add("rich-options");
  const current = choices.find(option => option.value === parameter.value)
    ?? choices.find(option => String(option.value) === String(parameter.value));
  selected.textContent = current?.label ?? textValue(parameter.value);
  const chevron = document.createElement("span");
  chevron.className = "parameter-select-chevron";
  chevron.innerHTML = icon("chevron");
  trigger.append(selected, chevron);

  const menu = document.createElement("div");
  menu.className = "parameter-select-menu";
  menu.id = `${parameter.id}:options`;
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", parameter.label);
  menu.hidden = true;
  trigger.setAttribute("aria-controls", menu.id);

  const options = choices.map((option) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `parameter-select-option${option === current ? " active" : ""}`;
    const label = document.createElement("span"); label.textContent = option.label;
    item.append(label);
    if (option.description) { const description = document.createElement("small"); description.textContent = option.description; item.append(description); }
    if (option.preview?.kind === "color") {
      const swatch = document.createElement("span"); swatch.className = "parameter-option-swatch";
      swatch.style.backgroundColor = option.preview.color; item.prepend(swatch);
    } else if (option.preview?.kind === "font") {
      const sample = document.createElement("span"); sample.className = "parameter-option-font";
      sample.style.fontFamily = option.preview.family; sample.textContent = option.preview.sample ?? option.label;
      sample.setAttribute("aria-hidden", "true"); item.append(sample);
    }
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(option === current));
    item.addEventListener("click", () => {
      selected.textContent = option.label;
      for (const sibling of options) {
        sibling.classList.toggle("active", sibling === item);
        sibling.setAttribute("aria-selected", String(sibling === item));
      }
      close(false);
      trigger.focus();
      change(option.value);
    });
    return item;
  });
  menu.append(...options);

  const { close } = bindDropdown(control, trigger, menu, options);
  control.append(trigger, menu);
  return control;
}

function colorValueControl(
  label: string,
  initial: string,
  change: (value: string) => void,
  draft = false,
): HTMLElement {
  const field = document.createElement("span");
  field.className = "parameter-color-field";
  const colorControl = document.createElement("span");
  colorControl.className = "parameter-color";
  colorControl.dataset.open = "false";
  const swatch = document.createElement("span");
  swatch.className = "parameter-color-swatch";
  const picker = document.createElement("input");
  picker.type = "color";
  picker.className = "parameter-color-native";
  uiAttr(picker, "aria-label", "inspector.color-picker", { label });
  picker.title = label;
  const exact = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(initial);
  picker.value = exact ? initial.slice(0, 7) : "#000000";
  swatch.style.background = exact ? initial : "transparent";
  const value = document.createElement("input");
  value.type = "text";
  value.className = "parameter-value parameter-color-value";
  value.value = initial;
  value.setAttribute("aria-label", label);
  value.spellcheck = false;
  let alpha = exact && initial.length === 9 ? initial.slice(7) : "";
  const replacement = (): string => `${picker.value.toUpperCase()}${alpha}`;
  const close = (): void => {
    if (openColorPicker?.root === colorControl) openColorPicker = undefined;
    colorControl.dataset.open = "false";
    picker.blur();
  };
  picker.addEventListener("click", (event) => {
    if (openColorPicker?.root === colorControl) {
      event.preventDefault();
      close();
      return;
    }
    openColorPicker?.close();
    openColorPicker = { root: colorControl, close };
    colorControl.dataset.open = "true";
  });
  picker.addEventListener("input", () => {
    swatch.style.background = picker.value;
    value.value = replacement();
    if (draft) change(replacement());
  });
  picker.addEventListener("change", () => {
    const next = replacement();
    swatch.style.background = picker.value;
    value.value = next;
    close();
    change(next);
  });
  value.addEventListener(draft ? "input" : "change", () => {
    const next = value.value.trim();
    const exact = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(next);
    swatch.style.background = next;
    if (exact) {
      picker.value = next.slice(0, 7);
      alpha = next.length === 9 ? next.slice(7) : "";
    }
    change(next);
  });
  colorControl.append(swatch, picker);
  field.append(colorControl, value);
  return field;
}

function fieldLabel(name: string): string {
  return name.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function blankValue(schema: ValueSchema): CanonicalValue {
  if (schema.kind === "string") return "";
  if (schema.kind === "literal") return schema.value;
  if (schema.kind === "number" || schema.kind === "null" || schema.kind === "oneOf") return null;
  if (schema.kind === "boolean") return false;
  if (schema.kind === "array") return [];
  if (schema.kind === "object") return Object.fromEntries(Object.entries(schema.fields)
    .filter(([, field]) => field.optional !== true)
    .map(([name, field]) => [name, blankValue(field.schema)]));
  return null;
}

function scalarDraftControl(
  label: string,
  schema: ValueSchema,
  held: CanonicalValue | undefined,
  presentation: StudioValuePresentation | undefined,
  change: (value: CanonicalValue) => void,
): HTMLElement {
  const control = parameterControlForPresentation(schema, presentation) ?? parameterControlForSchema(schema);
  if (control === undefined) {
    const value = document.createElement("span");
    value.className = "parameter-display parameter-readonly";
    value.textContent = "Opaque value";
    return value;
  }
  return parameterControl({
    id: label, label, domain: "how", section: { id: "record", label: "" },
    control,
    ...(schema.kind === "string" && schema.enum !== undefined ? { options: schema.enum } : {}),
    schema, value: held ?? null, ...(presentation === undefined ? {} : { valuePresentation: presentation }),
  }, change, true);
}

function recordDraftControl(
  schema: Extract<ValueSchema, { readonly kind: "object" }>,
  held: CanonicalValue,
  presentation: Extract<StudioValuePresentation, { readonly kind: "record" }> | undefined,
  change: (value: CanonicalValue) => void,
): HTMLElement {
  let record = (held !== null && !Array.isArray(held) && typeof held === "object"
    ? held
    : {}) as Readonly<Record<string, CanonicalValue>>;
  const fields = document.createElement("div");
  fields.className = "parameter-record-fields";
  for (const [name, field] of Object.entries(schema.fields)) {
    if (field.schema.kind === "literal") continue;
    fields.append(scalarDraftControl(fieldLabel(name), field.schema, record[name], presentation?.fields?.[name], (next) => {
      record = { ...record, [name]: next };
      change(record);
    }));
  }
  return fields;
}

function structuredControl(parameter: StudioItem["inspector"][number], change: (value: CanonicalValue) => void): HTMLElement {
  const declaredSchema = parameter.schema;
  const shell = document.createElement("div");
  shell.className = "parameter-structured";
  if (declaredSchema === undefined || (declaredSchema.kind !== "array" && declaredSchema.kind !== "object" && !parameterRecordVariants(declaredSchema).length)) return shell;
  let draft = structuredClone(parameter.value);
  const notice = document.createElement("div");
  notice.className = "parameter-structured-notice";
  notice.setAttribute("role", "status");
  const save = (): void => {
    const changed = !sameValue(draft, parameter.value);
    notice.hidden = !changed || valid();
    uiText(notice, "inspector.invalid-fields");
    if (changed && valid()) change(draft);
  };

  const valid = (): boolean => {
    try {
      validateParameterValue(draft, declaredSchema, parameter.label);
      return true;
    } catch {
      return false;
    }
  };

  const render = (): void => {
    shell.replaceChildren();
    const variants = parameterRecordVariants(declaredSchema);
    const schema = declaredSchema.kind === "array" ? declaredSchema : parameterRecordSchema(declaredSchema, draft);
    if (schema === undefined) return;
    if (variants.length) {
      const active = variants.find(variant => variant.schema === schema)!;
      shell.append(parameterControl({
        ...parameter, control: "select", value: variants.indexOf(active),
        options: variants.map((variant, index) => ({ value: index, label: textValue(variant.value) })),
      }, (next) => {
        if (next === variants.indexOf(active)) return;
        draft = blankValue(variants[Number(next)]!.schema);
        render();
        save();
      }));
    }
    const summary = document.createElement("div");
    summary.className = "parameter-structured-summary";
    const count = document.createElement("span");
    if (schema.kind === "array" && Array.isArray(draft)) uiText(count, "inspector.item-count", { count: draft.length });
    else uiText(count, "inspector.structured-value");
    summary.append(count);
    if (schema.kind === "array") shell.append(summary);

    if (schema.kind === "array") {
      const list = Array.isArray(draft) ? draft : [];
      const itemPresentation = parameter.valuePresentation?.kind === "list"
        ? parameter.valuePresentation.item
        : undefined;
      const items = document.createElement("div");
      items.className = "parameter-list-items";
      list.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = `parameter-list-item${schema.items.kind === "object" ? " record" : ""}`;
        const editor = schema.items.kind === "object"
          ? recordDraftControl(schema.items, item,
              itemPresentation?.kind === "record" ? itemPresentation : undefined, (next) => {
              const current = Array.isArray(draft) ? draft : [];
              draft = current.map((candidate, heldIndex) => heldIndex === index ? next : candidate);
              save();
            })
          : scalarDraftControl(`${parameter.label} ${index + 1}`, schema.items, item, itemPresentation, (next) => {
              const current = Array.isArray(draft) ? draft : [];
              draft = current.map((candidate, heldIndex) => heldIndex === index ? next : candidate);
              save();
            });
        const actions = document.createElement("span");
        actions.className = "parameter-list-actions";
        const move = (offset: number): void => {
          const reordered = [...(Array.isArray(draft) ? draft : [])];
          const [moving] = reordered.splice(index, 1);
          reordered.splice(index + offset, 0, moving!);
          draft = reordered;
          render();
          save();
        };
        const up = document.createElement("button");
        up.type = "button";
        up.textContent = "↑";
        uiAttr(up, "title", "inspector.move-up");
        up.disabled = index === 0;
        up.addEventListener("click", () => move(-1));
        const down = document.createElement("button");
        down.type = "button";
        down.textContent = "↓";
        uiAttr(down, "title", "inspector.move-down");
        down.disabled = index === list.length - 1;
        down.addEventListener("click", () => move(1));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.innerHTML = icon("minus");
        uiAttr(remove, "title", "inspector.remove-item");
        remove.disabled = schema.minItems !== undefined && list.length <= schema.minItems;
        remove.addEventListener("click", () => {
          const current = Array.isArray(draft) ? draft : [];
          draft = current.filter((_, heldIndex) => heldIndex !== index);
          render();
          save();
        });
        actions.append(up, down, remove);
        row.append(editor, actions);
        items.append(row);
      });
      shell.append(items);
    } else {
      shell.append(recordDraftControl(schema, draft,
        parameter.valuePresentation?.kind === "record" ? parameter.valuePresentation : undefined, (next) => {
        draft = next;
        save();
      }));
    }

    const footer = document.createElement("div");
    footer.className = "parameter-structured-footer";
    if (schema.kind === "array") {
      const list = Array.isArray(draft) ? draft : [];
      const add = document.createElement("button");
      add.type = "button";
      add.className = "parameter-structured-add";
      add.innerHTML = `${icon("plus")}${uiLabel(parameter.valuePresentation?.kind === "list"
        && parameter.valuePresentation.item?.kind === "color" ? "inspector.add-color" : "inspector.add-item")}`;
      add.disabled = schema.maxItems !== undefined && list.length >= schema.maxItems;
      add.addEventListener("click", () => {
        const current = Array.isArray(draft) ? draft : [];
        draft = [...current, blankValue(schema.items)];
        render();
        save();
      });
      footer.append(add);
    }
    if (schema.kind === "array") shell.append(footer);
    notice.hidden = sameValue(draft, parameter.value) || valid();
    shell.append(notice);
  };
  render();
  return shell;
}

function parameterControl(
  parameter: StudioItem["inspector"][number],
  change?: (value: CanonicalValue) => void,
  draft = false,
): HTMLElement {
  if (change !== undefined && parameter.control === "record" && parameter.schema !== undefined && parameterRecordVariants(parameter.schema).length) {
    return structuredControl(parameter, change);
  }
  const row = document.createElement("div");
  row.className = `parameter-row ${change === undefined ? "parameter-readonly" : "parameter-editable"} control-${parameter.control}`;
  const name = document.createElement("span");
  name.className = "parameter-label";
  name.textContent = parameter.label;
  name.title = parameter.summary ?? parameter.label;
  const right = document.createElement("span");
  right.className = "parameter-right parameter-control";
  if (change === undefined) {
    const value = document.createElement("span");
    value.className = "parameter-display";
    let displayValue = textValue(parameter.value);
    let unitLabel = parameter.unit;
    if (parameter.control === "number") {
      try {
        const numeric = parameterNumber(parameter.value, parameter.number);
        displayValue = String(numeric.value);
        unitLabel = numeric.suffix || parameter.unit;
      } catch { /* Keep the actual value visible when it is not a scalar. */ }
    } else if (parameter.control === "select") {
      displayValue = parameter.options?.map(parameterOption).find(option => option.value === parameter.value)?.label ?? displayValue;
    }
    value.textContent = displayValue;
    right.append(value);
    if (unitLabel !== undefined) {
      const unit = document.createElement("small"); unit.textContent = unitLabel; right.append(unit);
    }
    row.append(name, right);
    return row;
  }
  const commit = change;
  let unitLabel = parameter.unit;
  if (parameter.control === "select") {
    right.append(selectControl(parameter, commit));
  } else if (parameter.control === "color") {
    right.append(colorValueControl(parameter.label, textValue(parameter.value), (next) => {
      commit(next);
    }));
    if (parameter.swatches?.length) {
      const palette = document.createElement("span"); palette.className = "parameter-swatches";
      for (const color of parameter.swatches) {
        const swatch = document.createElement("button"); swatch.type = "button";
        swatch.style.backgroundColor = color; swatch.title = color; uiAttr(swatch, "aria-label", "inspector.use-color", { color });
        swatch.addEventListener("click", () => commit(color)); palette.append(swatch);
      }
      right.append(palette);
    }
  } else if (parameter.control === "list" || parameter.control === "record") {
    right.append(structuredControl(parameter, commit));
  } else {
    if (parameter.multiline && parameter.control === "text") {
      const value = document.createElement("textarea"); value.className = "parameter-value parameter-multiline";
      value.value = textValue(parameter.value); value.setAttribute("aria-label", parameter.label);
      value.addEventListener("change", () => commit(value.value)); right.append(value);
      row.append(name, right); return row;
    }
    const value = document.createElement("input");
    value.type = parameter.control === "boolean" ? "checkbox" : "text";
    value.className = "parameter-value";
    value.setAttribute("aria-label", parameter.label);
    value.spellcheck = false;
    if (value.type === "checkbox") value.checked = parameter.value === true || parameter.value === "true";
    else if (parameter.control === "number") {
      try {
        const numeric = parameterNumber(draft && parameter.value === null ? 0 : parameter.value, parameter.number);
        value.type = "number"; value.inputMode = "decimal"; value.value = draft && parameter.value === null ? "" : String(numeric.value);
        const schema = parameter.schema?.kind === "number" ? parameter.schema : undefined;
        const scale = parameter.number?.scale ?? 1;
        const minimum = parameter.number?.minimum ?? (schema?.minimum === undefined ? undefined : schema.minimum * scale);
        const maximum = parameter.number?.maximum ?? (schema?.maximum === undefined ? undefined : schema.maximum * scale);
        value.step = String(parameter.number?.step ?? (schema?.integer ? scale : "any"));
        if (minimum !== undefined) value.min = String(minimum);
        if (maximum !== undefined) value.max = String(maximum);
        value.required = true;
        unitLabel = numeric.suffix || parameter.unit;
      } catch (error) {
        value.value = textValue(parameter.value); value.readOnly = true;
        value.title = error instanceof Error ? error.message : String(error);
      }
    } else value.value = textValue(parameter.value);
    value.dataset.parameterId = parameter.id;
    if (!value.title) value.title = parameter.summary ?? parameter.label;
    value.addEventListener("change", () => {
      if (value.type === "checkbox") {
        commit(value.checked);
      } else if (parameter.control === "number") {
        if (draft) commit(Number.isFinite(value.valueAsNumber) ? value.valueAsNumber : null);
        else if (value.reportValidity()) commit(value.valueAsNumber);
      } else {
        commit(value.value);
      }
    });
    right.append(value);
  }
  if (unitLabel !== undefined) {
    const unit = document.createElement("small");
    unit.textContent = unitLabel;
    right.append(unit);
  }
  row.append(name, right);
  row.title = parameter.summary ?? parameter.label;
  return row;
}

function persistedParameterControl(
  owner: ParameterOwner,
  parameter: StudioItem["inspector"][number],
): HTMLElement {
  return parameterControl(parameter, parameter.edit === undefined
    ? undefined
    : (value) => commitControl(owner, parameter, value));
}

function parameterGroups(owner: ParameterOwner, fields: readonly StudioItem["inspector"][number][]): readonly HTMLElement[] {
  const groups = new Map<string, StudioItem["inspector"][number][]>();
  for (const field of fields) {
    const key = `${field.section.id}\u0000${field.section.label}`;
    const held = groups.get(key) ?? [];
    held.push(field);
    groups.set(key, held);
  }
  return [...groups].map(([key, values]) => {
    const [, label = ""] = key.split("\u0000");
    return group(label, values.map((parameter) => persistedParameterControl(owner, parameter)), "parameter-group inspector-field-group");
  });
}

let parameterWriteState: "" | "common.saving" | "common.saved" | "common.failed" = "";
async function writeParameter(owner: ParameterOwner, parameter: StudioItem["inspector"][number], replacement: CanonicalValue): Promise<void> {
  const state = store.current();
  if (state === undefined) return;
  parameterWriteState = "common.saving";
  status.title = "";
  uiText(status, parameterWriteState);
  status.className = "status saving";
  try {
    await applyStudioMutation({
      type: "parameter.adjust",
      revision: state.snapshot.revision,
      owner,
      parameterId: parameter.id,
      value: replacement,
    });
    parameterWriteState = "common.saved";
    uiText(status, parameterWriteState);
    status.className = "status saved";
  } catch (error) {
    // Validation and stale-revision rejections do not publish a new snapshot.
    // Restore the accepted value just as a rejected compilation does.
    restoreParameterControls();
    parameterWriteState = "common.failed";
    uiText(status, error instanceof Error ? "common.save-failed" : parameterWriteState);
    status.className = "status error";
    status.title = error instanceof Error ? error.message : String(error);
  }
}

function trackInspectorGroups(
  track: StudioSnapshot["tracks"][number],
  domain: StudioInspectorDomain,
): readonly HTMLElement[] {
  const grouped = new Map<string, typeof track.inspectorObjects>();
  for (const object of track.inspectorObjects) {
    if (!object.inspector.some((field) => field.domain === domain)) continue;
    grouped.set(object.group, [...(grouped.get(object.group) ?? []), object]);
  }
  return [...grouped].map(([label, objects]) => group(label, objects.map((object) => {
    const details = document.createElement("details");
    details.className = "inspector-object";
    const summary = document.createElement("summary");
    summary.textContent = object.title;
    const fields = document.createElement("div");
    fields.className = "inspector-object-fields";
    fields.append(...parameterGroups(
      { kind: "track-object", track: track.address, objectId: object.id },
      object.inspector.filter((field) => field.domain === domain),
    ));
    details.append(summary, fields);
    return details;
  }), "inspector-object-group"));
}

/**
 * A single strip between the picture and the timeline. It is a row of the
 * layout rather than a floating card, so it can never cover the frame being
 * inspected or the transport used to reach it.
 */
function renderInspector(snapshot: StudioSnapshot, address: StudioItemAddress | undefined): void {
  const item = address === undefined ? undefined : store.item(address);
  const track = item === undefined ? undefined : snapshot.tracks.find((candidate) =>
    sameStudioTrackAddress(candidate.address, item.address.track));

  if (item === undefined) {
    defaultWorkspaceHeading();
    const fps = snapshot.timeline.frameRate.numerator / snapshot.timeline.frameRate.denominator;
    inspector.replaceChildren(
      uiGroup("inspector.project", [
        property("inspector.author", snapshot.source.path, "property-code"),
        property("inspector.invocation", snapshot.invocation.source ?? "command arguments", "property-code"),
        property("inspector.sources", String(snapshot.source.files.length)),
        property("inspector.tracks", String(snapshot.tracks.length), "property-number"),
      ]),
      uiGroup("inspector.canvas", [
        property("inspector.resolution", `${snapshot.canvas.width} × ${snapshot.canvas.height}`, "property-number"),
        property("inspector.aspect-ratio", aspectRatio(snapshot.canvas.width, snapshot.canvas.height), "property-number"),
      ]),
      uiGroup("inspector.timeline", [
        property("inspector.duration", `${snapshot.timeline.durationSec.toFixed(2)} s`, "property-number"),
        property("inspector.frame-rate", `${fps.toFixed(Number.isInteger(fps) ? 0 : 2)} fps`, "property-number"),
        property("inspector.frames", String(snapshot.timeline.frameCount), "property-number"),
      ]),
      uiGroup("inspector.build", [
        property("inspector.targets", snapshot.invocation.targets.join(", ") || "—", "property-code"),
      ]),
    );
    return;
  }
  const domains = domainOrder.filter((domain) => item.inspector.some((field) => field.domain === domain)
    || track?.inspectorObjects.some((object) => object.inspector.some((field) => field.domain === domain)) === true);
  if (domains.length === 0) {
    defaultWorkspaceHeading();
    previewParticipation(item);
    const empty = document.createElement("div");
    empty.className = "inspector-empty";
    uiText(empty, "inspector.empty");
    inspector.replaceChildren(empty);
    return;
  }
  const itemKey = studioItemAddressKey(item.address);
  const remembered = inspectorDomainByItem.get(itemKey);
  const activeDomain = remembered !== undefined && domains.includes(remembered) ? remembered : domains[0]!;
  inspectorDomainByItem.set(itemKey, activeDomain);
  inspectorHeading(item, domains, activeDomain, () => renderInspector(snapshot, item.address));

  const domainFields = item.inspector.filter((field) => field.domain === activeDomain);
  const pages = new Map<string, { readonly label: string; readonly fields: typeof domainFields }>();
  const commonFields = domainFields.filter(field => field.page === undefined);
  for (const field of domainFields.filter(field => field.page !== undefined)) {
    const id = field.page!.id;
    const page = pages.get(id) ?? { label: field.page?.label ?? "", fields: [] };
    pages.set(id, { ...page, fields: [...page.fields, field] });
  }
  const pageIds = [...pages.keys()];
  if (pageIds.length === 0) {
    inspector.replaceChildren(
      ...parameterGroups({ kind: "item", item: item.address }, commonFields),
      ...(track === undefined ? [] : trackInspectorGroups(track, activeDomain)),
    );
    return;
  }
  const memoryKey = `${itemKey}:${activeDomain}`;
  const rememberedPage = inspectorPageByItem.get(memoryKey);
  const activePage = rememberedPage !== undefined && pages.has(rememberedPage) ? rememberedPage : pageIds[0]!;
  inspectorPageByItem.set(memoryKey, activePage);
  const page = pages.get(activePage);
  const subtabs = document.createElement("div");
  subtabs.className = "inspector-subtabs";
  if (pageIds.length > 1) {
    subtabs.append(...pageIds.map((id) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `inspector-subtab${id === activePage ? " active" : ""}`;
      const label = document.createElement("span");
      label.textContent = pages.get(id)?.label ?? id;
      button.append(label);
      button.addEventListener("click", () => {
        inspectorPageByItem.set(memoryKey, id);
        renderInspector(snapshot, item.address);
      });
      return button;
    }));
  }
  inspector.replaceChildren(
    ...(pageIds.length > 1 ? [subtabs] : []),
    ...parameterGroups({ kind: "item", item: item.address }, [...commonFields, ...(page?.fields ?? [])]),
    ...(track === undefined ? [] : trackInspectorGroups(track, activeDomain)),
  );
}

/** Exact identity choice for coincident anchors, through package-declared domain handles. */
function renderTemporalDomainInspector(snapshot: StudioSnapshot, companion: string, domainId: string, itemId: string): void {
  const domain = snapshot.temporalDomains.find((candidate) => candidate.companion === companion && candidate.id === domainId);
  const item = domain?.items.find((candidate) => candidate.id === itemId);
  if (domain === undefined || item === undefined) { inspector.replaceChildren(); return; }
  defaultWorkspaceHeading();
  const consumers = snapshot.tracks.flatMap((track) => track.items).flatMap((studioItem) => studioItem.editHandles
    .filter((handle) => handle.enabled && handle.domain?.companion === companion
      && handle.domain.domainId === domainId && handle.domain.itemId === itemId)
    .map((handle) => ({ studioItem, handle })));
  if (item.editable !== true || consumers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "inspector-empty";
    uiText(empty, "inspector.empty");
    inspector.replaceChildren(empty);
    return;
  }
  const endpoints: readonly (readonly [Message, string])[] = item.kind === "point"
    ? [["inspector.instant", item.anchorId]]
    : [["inspector.start", item.startAnchorId], ["inspector.end", item.endAnchorId]];
  const rows = endpoints.map(([label, anchorId]) => {
    const anchor = domain.anchors.find((candidate) => candidate.id === anchorId)!;
    const describe = (node: Element, candidate: typeof anchor): void => {
      node.textContent = candidate.label ?? candidate.detail ?? `${candidate.kind} · ${candidate.id}`;
    };
    const candidates = domain.anchors.filter((candidate) => candidate.frame === anchor.frame).flatMap((candidate) => {
      const target: DomainTarget = item.kind === "point"
        ? { kind: "point", companion, domainId, itemId, anchorId: candidate.id }
        : { kind: "span", companion, domainId, itemId,
            startAnchorId: label === "inspector.start" ? candidate.id : item.startAnchorId,
            endAnchorId: label === "inspector.end" ? candidate.id : item.endAnchorId };
      const owner = consumers.find(({ handle }) => domainGestureSpan(domain.anchors, handle, target) !== undefined);
      return owner === undefined ? [] : [{ item: candidate, target, ...owner }];
    });
    if (candidates.length < 2) {
      const row = property(label, "");
      describe(row.querySelector("strong")!, anchor);
      return row;
    }
    const row = document.createElement("label");
    row.className = "property";
    const name = document.createElement("span");
    uiText(name, label);
    const control = document.createElement("select");
    control.className = "parameter-value";
    control.setAttribute("aria-label", `${item.label} ${label}`);
    for (const { item: candidate } of candidates) {
      const option = document.createElement("option"); option.value = candidate.id; describe(option, candidate);
      control.append(option);
    }
    control.value = anchorId;
    control.addEventListener("change", () => {
      const choice = candidates.find(({ item: candidate }) => candidate.id === control.value)!;
      const span = domainGestureSpan(domain.anchors, choice.handle, choice.target)!;
      const temporal = choice.handle.temporal!;
      control.disabled = true;
      uiText(status, "common.saving"); status.className = "status saving";
      void applyStudioMutation({ type: "timeline.adjust", revision: snapshot.revision,
        item: choice.studioItem.address, gesture: choice.handle.gesture,
        target: temporal.kind === "instant" ? { kind: "instant", frame: span.startFrame, domain: choice.target }
          : { kind: "window", ...span, domain: choice.target },
      }).then(() => { uiText(status, "common.saved"); status.className = "status saved"; })
        .catch((error: unknown) => {
          control.value = anchorId; uiText(status, "common.save-failed"); status.className = "status error";
          status.title = error instanceof Error ? error.message : String(error);
        }).finally(() => { control.disabled = false; });
    });
    row.append(name, control);
    return row;
  });
  inspector.replaceChildren(group(domain.presentation.label ?? item.label, rows));
}

// The word being spoken at the playhead, which is the point of carrying token
// timings at all: it ties the Script text to the frame on screen.
store.subscribe(({ snapshot, playhead }) => {
  const spoken = snapshot.temporalDomains.flatMap((domain) => domain.items)
    .find((item) => item.kind === "span" && item.followPlayhead === true
      && playhead.frame >= item.startFrame && playhead.frame < item.endFrameExclusive);
  code.speak(spoken?.range);
});

let described = "";
let scrolledTo = "";

store.subscribe(({ snapshot, selection }) => {
  const origin = selection.kind === "none" ? undefined : selection.origin;
  const chosen = selection.kind === "item" ? store.item(selection.item) : undefined;
  const chosenDomain = selection.kind === "temporal-domain"
    ? snapshot.temporalDomains.find((domain) => domain.companion === selection.companion
      && domain.id === selection.domainId)?.items.find((item) => item.id === selection.itemId)
    : undefined;
  // Rebuilding this every frame of playback would be DOM churn for no change.
  const describes = `${snapshot.revision}:${selection.kind}:${chosen === undefined ? chosenDomain?.id ?? "" : studioItemAddressKey(chosen.address)}:${chosen === undefined ? "" : String(!store.current()?.preview.omittedItemKeys.has(studioItemAddressKey(chosen.address)))}`;
  if (describes !== described) {
    described = describes;
    if (selection.kind === "temporal-domain") {
      renderTemporalDomainInspector(snapshot, selection.companion, selection.domainId, selection.itemId);
    }
    else renderInspector(snapshot, chosen?.address);
  }

  // Source outlines are selection affordances, not a second always-on syntax
  // layer. Keeping every live Selection outlined made the code pane fill with
  // yellow polygons while the author was merely playing the film.
  const highlights: Highlight[] = [];
  // The element that placed what is on screen is outlined too. Knowing a cutaway
  // is running is half the answer; the other half is which line put it there.
  // Only what was chosen is outlined. What is merely drawn at this frame is
  // already said by the gutter bars, and a second outline for it made a board
  // look picked when one of its rows was.
  if (chosen?.elementLocation?.path === snapshot.source.path) {
    highlights.push({ range: chosen.elementLocation.range, tone: "element" });
  }
  if (chosenDomain?.range !== undefined) highlights.push({ range: chosenDomain.range, tone: "binding" });

  // Scroll only when the selection actually moved, and never toward the pane
  // the author is pointing at: following the playhead every frame would drag
  // the source out from under whoever is reading it.
  const focused = chosen === undefined && chosenDomain === undefined
    ? ""
    : `${snapshot.revision}:${selection.kind}:${chosen?.id ?? chosenDomain?.id}`;
  const moved = focused.length > 0 && focused !== scrolledTo;
  scrolledTo = focused;
  code.highlight(highlights, moved && origin !== "code");
});

// Clicking a marked region in the source selects what it binds and looks at the
// instant it covers. The source token and range overlay carry that relationship;
// the line-number gutter stays quiet.
code.element.addEventListener("click", (event) => {
  if ((event.target as HTMLElement | null)?.closest("button, textarea") !== null) return;
  const state = store.current();
  if (state === undefined) return;
  if (code.activePath() !== state.snapshot.source.path) return;
  const offset = code.offsetAt(event);
  // Below the last line, or in the heading: nothing is being pointed at.
  if (offset === undefined) {
    store.clearSelection();
    return;
  }
  const domainItem = domainItemAtOffset(state.snapshot, offset);
  if (domainItem !== undefined) {
    store.selectTemporalDomainItem(domainItem.companion, domainItem.domainId, domainItem.itemId, "code");
    return;
  }
  const item = itemAtOffset(state.snapshot, offset);

  // A click inside marked prose lands inside the innermost marker written there,
  // not at the start of whatever encloses it. `@{amount}` places nothing, so
  // resolving through Items alone would throw the playhead out to `@{fee}`.
  const span = spanAtOffset(state.snapshot, offset);
  // Prose is anywhere a marker was written; whether an Item also covers that
  // offset only decides which Item to select, not whether the click counts.
  const itemRange = item?.elementLocation?.path === state.snapshot.source.path
    ? item.elementLocation.range
    : undefined;
  const inProse = span !== undefined
    && (itemRange === undefined || !(offset >= itemRange.start && offset <= itemRange.end));
  if (inProse) {
    // An Item is named after itself and remembers what placed it, so a marker
    // finds the Items it put there through the second, not the first.
    const bound = state.snapshot.tracks
      .flatMap((track) => track.items)
      .find((item) => item.marker?.companion === span.companion
        && item.marker.domainId === span.domainId
        && item.marker.itemId === span.itemId);
    // A marker that places nothing still sits inside one that does, so the
    // enclosing Item stays selected rather than leaving the inspector blank.
    const target = bound?.address ?? item?.address;
    if (target === undefined) {
      store.selectTemporalDomainItem(span.companion, span.domainId, span.itemId, "code");
      store.seek(span.startFrame, "code");
    }
    else store.focus(span.startFrame, target, "code");
    return;
  }
  if (item === undefined) store.clearSelection();
  else store.selectItem(item.address, "code");
});

window.addEventListener("keydown", (event) => {
  const state = store.current();
  if (state === undefined || event.metaKey || event.ctrlKey || event.altKey) return;
  // Space is the transport everywhere else; typing in a field is not transport.
  const target = event.target instanceof Element ? event.target : undefined;
  const editing = target?.closest("input, textarea, select, [contenteditable=true], .parameter-control") !== null && target !== undefined;
  if (editing) return;
  if (event.key === " ") {
    stage.toggle();
    event.preventDefault();
    return;
  }
  if (shell.dataset.view === "comments" && ["-", "_", "=", "+", "\\", "f", "F"].includes(event.key)) return;
  if (event.key === "-" || event.key === "_") {
    timeline.zoomOut();
    event.preventDefault();
    return;
  }
  if (event.key === "=" || event.key === "+") {
    timeline.zoomIn();
    event.preventDefault();
    return;
  }
  if (event.key === "\\" || event.key.toLowerCase() === "f") {
    timeline.fit();
    event.preventDefault();
    return;
  }
  const step = event.shiftKey ? 10 : 1;
  if (event.key === "ArrowLeft" || event.key === ",") store.seek(state.playhead.frame - step, "timeline");
  else if (event.key === "ArrowRight" || event.key === ".") store.seek(state.playhead.frame + step, "timeline");
  else if (event.key === "Home") store.seek(0, "timeline");
  else if (event.key === "End") store.seek(state.snapshot.timeline.frameCount - 1, "timeline");
  else if (event.key === "Escape") store.clearSelection();
  else return;
  event.preventDefault();
});

function applySnapshot(snapshot: StudioSnapshot): void {
  userText(failureView, "");
  status.className = "status";
  status.title = "";
  userText(status, "");
  renderMeta(snapshot);
  library.show(snapshot);
  store.load(snapshot);
}

function applyFailure(failure: StudioFailure): void {
  status.className = "status error";
  uiText(status, "common.compile-failed");
  failureView.textContent = failure.error;
  if (failure.range !== undefined) code.highlight([{ range: failure.range, tone: "element" }], true);
  // A parameter control changes immediately in the browser, but the source
  // remains the only truth. If recompilation rejects the transaction, rebuild
  // the Inspector from the last accepted snapshot instead of leaving a false
  // value visible in the field.
  const current = store.current();
  if (current === undefined) return;
  if (current.selection.kind === "item") renderInspector(current.snapshot, current.selection.item);
  else if (current.selection.kind === "temporal-domain") renderTemporalDomainInspector(current.snapshot,
    current.selection.companion, current.selection.domainId, current.selection.itemId);
}

const response = await fetch("/__studio/session");
const initial = await response.json() as StudioSnapshot | StudioFailure;
if (response.ok && "tracks" in initial) applySnapshot(initial);
else applyFailure(initial as StudioFailure);

type Hot = { on(event: string, listener: (value: unknown) => void): void };
const hot = (import.meta as ImportMeta & { hot?: Hot }).hot;
hot?.on("studio:snapshot", (value) => applySnapshot(value as StudioSnapshot));
hot?.on("studio:error", (value) => applyFailure(value as StudioFailure));
