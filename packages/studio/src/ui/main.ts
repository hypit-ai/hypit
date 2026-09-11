import type { Clip, StudioFailure, StudioInspectorDomain, StudioSnapshot } from "../shared.js";
import type { CanonicalValue, ValueSchema } from "@hypit/protocol";
import { parameterAuthorValue, parameterNumber, parameterOption, validateParameterValue } from "../parameter-values.js";
import { createCodePane } from "./code.js";
import { icon } from "./icons.js";
import { createLibraryPane } from "./library.js";
import { createHandle } from "./resize.js";
import type { Highlight } from "./code.js";
import { intentAtOffset, spanAtOffset } from "./markers.js";
import { clipAtOffset, createStore } from "./selection.js";
import { createStage } from "./stage.js";
import { semanticGestureSpan } from "../temporal-edit.js";
import type { SemanticTarget } from "../temporal-edit.js";
import { applyStudioMutation } from "./writeback.js";
import { createTimeline } from "./timeline.js";
import "../style.css";

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
    </div>
  </header>
  <main class="studio-shell">
    <section class="upper-shell">
      <aside class="source-panel" data-library></aside>
      <div class="preview-panel" data-stage></div>
      <aside class="workspace-panel">
        <div class="pane-heading workspace-heading" data-workspace-heading>
          <div class="pane-title">${icon("tune")}<h2>Properties</h2></div>
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

const store = createStore();
const code = createCodePane();
const stage = createStage(store, (id) => library.selectArtifact(id));
const library = createLibraryPane(code, (artifact) => stage.openArtifact(artifact), (artifact) => stage.renameArtifact(artifact));
const timeline = createTimeline(store);
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
shell.insertBefore(createHandle({
  axis: "row", initial: Math.round(window.innerHeight * 0.45), minimum: 220, invert: true,
  maximum: () => Math.max(260, shell.clientHeight - 260),
  apply: (size) => { shell.style.setProperty("--timeline-height", `${size}px`); },
  remember: "hypit-studio.v3.timeline-height",
}), app.querySelector<HTMLElement>("[data-timeline]")!);
const inspector = app.querySelector<HTMLElement>("[data-inspector]")!;
const workspaceHeading = app.querySelector<HTMLElement>("[data-workspace-heading]")!;
const meta = app.querySelector<HTMLElement>("[data-meta]")!;
const project = app.querySelector<HTMLElement>("[data-project]")!;
const status = app.querySelector<HTMLElement>("[data-status]")!;
const failureView = app.querySelector<HTMLElement>("[data-failure]")!;

timeline.element.addEventListener("studio:write", (event) => {
  const state = (event as CustomEvent<{ readonly state?: string }>).detail.state;
  status.className = state === "error" ? "status error" : state === "saved" ? "status saved" : "status saving";
  status.textContent = state === "error" ? "Save failed" : state === "saved" ? "Saved" : "Saving";
});

// Program-level facts never change while a Source is being read, so they live in
// the header rather than taking a panel that would have to sit over something.
function renderMeta(snapshot: StudioSnapshot): void {
  project.textContent = snapshot.source.path.split(/[\\/]/u).at(-1) ?? snapshot.source.path;
  project.title = snapshot.source.path;
  // Sequence facts belong to the project/inspector, not the application chrome.
  // The timeline transport is the single persistent time readout.
  meta.textContent = "";
}

function property(label: string, value: string, tone?: string): HTMLElement {
  const node = document.createElement("div");
  node.className = `property${tone === undefined ? "" : ` ${tone}`}`;
  node.innerHTML = "<span></span><strong></strong>";
  node.querySelector("span")!.textContent = label;
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

function aspectRatio(width: number, height: number): string {
  let a = width;
  let b = height;
  while (b !== 0) [a, b] = [b, a % b];
  return `${width / a}:${height / a}`;
}

const domainPresentation: Readonly<Record<StudioInspectorDomain, { readonly label: string; readonly icon: string }>> = {
  where: { label: "Where", icon: "where" },
  how: { label: "How", icon: "how" },
  when: { label: "When", icon: "when" },
};
const domainOrder: readonly StudioInspectorDomain[] = ["where", "how", "when"];
const inspectorDomainByEntity = new Map<string, StudioInspectorDomain>();
const inspectorPageByEntity = new Map<string, string>();

function defaultWorkspaceHeading(): void {
  workspaceHeading.className = "pane-heading workspace-heading";
  workspaceHeading.innerHTML = `<div class="pane-title">${icon("tune")}<h2>Properties</h2></div>`;
}

function inspectorHeading(
  entityId: string,
  domains: readonly StudioInspectorDomain[],
  active: StudioInspectorDomain,
  select: (domain: StudioInspectorDomain) => void,
): void {
  workspaceHeading.className = "pane-heading workspace-heading inspector-domain-tabs";
  workspaceHeading.replaceChildren(...domains.map((domain) => {
    const presentation = domainPresentation[domain];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `inspector-domain-tab${domain === active ? " active" : ""}`;
    button.dataset.domain = domain;
    button.innerHTML = `${icon(presentation.icon)}<strong>${presentation.label}</strong>`;
    button.setAttribute("aria-pressed", String(domain === active));
    button.addEventListener("click", () => {
      inspectorDomainByEntity.set(entityId, domain);
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

function restoreParameterControls(entityId: string): void {
  const current = store.current();
  if (current?.selection.kind === "clip" && current.selection.clipId === entityId) {
    renderInspector(current.snapshot, entityId);
  }
}

function commitControl(entityId: string, parameter: Clip["inspector"][number], replacement: CanonicalValue): void {
  try {
    if (sameValue(parameterAuthorValue(parameter, replacement), parameter.value)) return;
    void writeParameter(entityId, parameter, replacement);
  } catch (error) {
    restoreParameterControls(entityId);
    status.textContent = "Invalid value"; status.className = "status error";
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
  entityId: string,
  parameter: Clip["inspector"][number],
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
      commitControl(entityId, parameter, option.value);
    });
    return item;
  });
  menu.append(...options);

  const close = (restoreFocus: boolean): void => {
    control.classList.remove("open", "open-up");
    trigger.setAttribute("aria-expanded", "false");
    menu.hidden = true;
    if (restoreFocus) trigger.focus();
  };
  const open = (focus: "selected" | "first" | "last" = "selected"): void => {
    control.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    control.classList.remove("open-up");
    const scroll = control.closest<HTMLElement>(".workspace-scroll");
    if (scroll !== null) {
      const menuBox = menu.getBoundingClientRect();
      const scrollBox = scroll.getBoundingClientRect();
      if (menuBox.bottom > scrollBox.bottom && trigger.getBoundingClientRect().top - menuBox.height >= scrollBox.top) {
        control.classList.add("open-up");
      }
    }
    const target = focus === "first" ? options[0]
      : focus === "last" ? options.at(-1)
      : options.find((option) => option.classList.contains("active")) ?? options[0];
    target?.focus();
  };
  const moveOptionFocus = (offset: number): void => {
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = current < 0 ? 0 : (current + offset + options.length) % options.length;
    options[next]?.focus();
  };

  trigger.addEventListener("click", () => {
    if (control.classList.contains("open")) close(false);
    else open();
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      open(event.key === "ArrowDown" ? "first" : "last");
    } else if (event.key === "Escape" && control.classList.contains("open")) {
      event.preventDefault();
      event.stopPropagation();
      close(false);
    }
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      moveOptionFocus(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      options[event.key === "Home" ? 0 : options.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  });
  control.addEventListener("focusout", (event) => {
    if (event.relatedTarget instanceof Node && control.contains(event.relatedTarget)) return;
    close(false);
  });
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
  picker.setAttribute("aria-label", `${label} picker`);
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
    const valid = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(next);
    swatch.style.background = valid ? next : "transparent";
    if (valid) {
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
  if (schema.kind === "number" || schema.kind === "null" || schema.kind === "literal" || schema.kind === "oneOf") return null;
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
  change: (value: CanonicalValue) => void,
): HTMLElement {
  if (schema.kind === "string" && schema.format === "color") {
    return colorValueControl(label, typeof held === "string" ? held : "", change, true);
  }
  const input = document.createElement("input");
  input.className = "parameter-value parameter-structured-value";
  input.setAttribute("aria-label", label);
  input.spellcheck = false;
  if (schema.kind === "boolean") {
    input.type = "checkbox";
    input.checked = held === true;
    input.addEventListener("change", () => change(input.checked));
    return input;
  }
  input.type = "text";
  if (schema.kind === "number") input.inputMode = "decimal";
  input.value = held === undefined || held === null ? "" : textValue(held);
  input.addEventListener("input", () => {
    if (schema.kind === "number") {
      const number = Number(input.value);
      change(input.value.trim().length === 0 || !Number.isFinite(number) ? null : number);
    } else {
      change(input.value);
    }
  });
  return input;
}

function recordDraftControl(
  schema: Extract<ValueSchema, { readonly kind: "object" }>,
  held: CanonicalValue,
  change: (value: CanonicalValue) => void,
): HTMLElement {
  let record = (held !== null && !Array.isArray(held) && typeof held === "object"
    ? held
    : {}) as Readonly<Record<string, CanonicalValue>>;
  const fields = document.createElement("div");
  fields.className = "parameter-record-fields";
  for (const [name, field] of Object.entries(schema.fields)) {
    const row = document.createElement("label");
    row.className = "parameter-record-field";
    const copy = document.createElement("span");
    copy.textContent = fieldLabel(name);
    row.append(copy, scalarDraftControl(fieldLabel(name), field.schema, record[name], (next) => {
      record = { ...record, [name]: next };
      change(record);
    }));
    fields.append(row);
  }
  return fields;
}

function structuredControl(entityId: string, parameter: Clip["inspector"][number]): HTMLElement {
  const schema = parameter.schema;
  const shell = document.createElement("div");
  shell.className = "parameter-structured";
  if (schema === undefined || (schema.kind !== "array" && schema.kind !== "object")) return shell;
  let draft = structuredClone(parameter.value);
  let refreshDecisions = (): void => {};

  const valid = (): boolean => {
    try {
      validateParameterValue(draft, schema, parameter.label);
      return true;
    } catch {
      return false;
    }
  };

  const render = (): void => {
    shell.replaceChildren();
    const summary = document.createElement("div");
    summary.className = "parameter-structured-summary";
    const count = document.createElement("span");
    count.textContent = schema.kind === "array" && Array.isArray(draft)
      ? `${draft.length} ${draft.length === 1 ? "item" : "items"}`
      : "Structured value";
    summary.append(count);
    shell.append(summary);

    if (schema.kind === "array") {
      const list = Array.isArray(draft) ? draft : [];
      const items = document.createElement("div");
      items.className = "parameter-list-items";
      list.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = `parameter-list-item${schema.items.kind === "object" ? " record" : ""}`;
        const editor = schema.items.kind === "object"
          ? recordDraftControl(schema.items, item, (next) => {
              const current = Array.isArray(draft) ? draft : [];
              draft = current.map((candidate, heldIndex) => heldIndex === index ? next : candidate);
              refreshDecisions();
            })
          : scalarDraftControl(`${parameter.label} ${index + 1}`, schema.items, item, (next) => {
              const current = Array.isArray(draft) ? draft : [];
              draft = current.map((candidate, heldIndex) => heldIndex === index ? next : candidate);
              refreshDecisions();
            });
        const actions = document.createElement("span");
        actions.className = "parameter-list-actions";
        const move = (offset: number): void => {
          const reordered = [...(Array.isArray(draft) ? draft : [])];
          const [moving] = reordered.splice(index, 1);
          reordered.splice(index + offset, 0, moving!);
          draft = reordered;
          render();
        };
        const up = document.createElement("button");
        up.type = "button";
        up.textContent = "↑";
        up.title = "Move up";
        up.disabled = index === 0;
        up.addEventListener("click", () => move(-1));
        const down = document.createElement("button");
        down.type = "button";
        down.textContent = "↓";
        down.title = "Move down";
        down.disabled = index === list.length - 1;
        down.addEventListener("click", () => move(1));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.innerHTML = icon("minus");
        remove.title = "Remove item";
        remove.disabled = schema.minItems !== undefined && list.length <= schema.minItems;
        remove.addEventListener("click", () => {
          const current = Array.isArray(draft) ? draft : [];
          draft = current.filter((_, heldIndex) => heldIndex !== index);
          render();
        });
        actions.append(up, down, remove);
        row.append(editor, actions);
        items.append(row);
      });
      shell.append(items);
    } else {
      shell.append(recordDraftControl(schema, draft, (next) => {
        draft = next;
        refreshDecisions();
      }));
    }

    const footer = document.createElement("div");
    footer.className = "parameter-structured-footer";
    if (schema.kind === "array") {
      const list = Array.isArray(draft) ? draft : [];
      const add = document.createElement("button");
      add.type = "button";
      add.className = "parameter-structured-add";
      add.innerHTML = `${icon("plus")}<span>Add ${schema.items.kind === "string" && schema.items.format === "color" ? "color" : "item"}</span>`;
      add.disabled = schema.maxItems !== undefined && list.length >= schema.maxItems;
      add.addEventListener("click", () => {
        const current = Array.isArray(draft) ? draft : [];
        draft = [...current, blankValue(schema.items)];
        render();
      });
      footer.append(add);
    }
    const decisions = document.createElement("span");
    decisions.className = "parameter-structured-decisions";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset";
    reset.disabled = sameValue(draft, parameter.value);
    reset.addEventListener("click", () => {
      draft = structuredClone(parameter.value);
      render();
    });
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "primary";
    apply.textContent = "Apply";
    apply.addEventListener("click", () => commitControl(entityId, parameter, draft));
    refreshDecisions = () => {
      reset.disabled = sameValue(draft, parameter.value);
      apply.disabled = reset.disabled || !valid();
    };
    refreshDecisions();
    decisions.append(reset, apply);
    footer.append(decisions);
    shell.append(footer);
  };
  render();
  return shell;
}

function parameterControl(entityId: string, parameter: Clip["inspector"][number]): HTMLElement {
  const row = document.createElement("div");
  row.className = `parameter-row parameter-editable control-${parameter.control}`;
  const name = document.createElement("span");
  name.className = "parameter-label";
  name.textContent = parameter.label;
  name.title = parameter.summary ?? parameter.label;
  const right = document.createElement("span");
  right.className = "parameter-right parameter-control";
  let unitLabel = parameter.unit;
  if (parameter.control === "select") {
    right.append(selectControl(entityId, parameter));
  } else if (parameter.control === "color") {
    right.append(colorValueControl(parameter.label, textValue(parameter.value), (next) => {
      commitControl(entityId, parameter, next);
    }));
    if (parameter.swatches?.length) {
      const palette = document.createElement("span"); palette.className = "parameter-swatches";
      for (const color of parameter.swatches) {
        const swatch = document.createElement("button"); swatch.type = "button";
        swatch.style.backgroundColor = color; swatch.title = color; swatch.setAttribute("aria-label", `Use ${color}`);
        swatch.addEventListener("click", () => commitControl(entityId, parameter, color)); palette.append(swatch);
      }
      right.append(palette);
    }
  } else if (parameter.control === "list" || parameter.control === "record") {
    right.append(structuredControl(entityId, parameter));
  } else {
    if (parameter.multiline && parameter.control === "text") {
      const value = document.createElement("textarea"); value.className = "parameter-value parameter-multiline";
      value.value = textValue(parameter.value); value.setAttribute("aria-label", parameter.label);
      value.addEventListener("change", () => commitControl(entityId, parameter, value.value)); right.append(value);
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
        const numeric = parameterNumber(parameter.value, parameter.number);
        value.type = "number"; value.inputMode = "decimal"; value.value = String(numeric.value);
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
        commitControl(entityId, parameter, value.checked);
      } else if (parameter.control === "number") {
        if (value.reportValidity()) commitControl(entityId, parameter, value.valueAsNumber);
      } else {
        commitControl(entityId, parameter, value.value);
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

function parameterGroups(entityId: string, fields: readonly Clip["inspector"][number][]): readonly HTMLElement[] {
  const groups = new Map<string, Clip["inspector"][number][]>();
  for (const field of fields) {
    const key = `${field.section.id}\u0000${field.section.label}`;
    const held = groups.get(key) ?? [];
    held.push(field);
    groups.set(key, held);
  }
  return [...groups].map(([key, values]) => {
    const [, label = ""] = key.split("\u0000");
    return group(label, values.map((parameter) => parameterControl(entityId, parameter)), "parameter-group inspector-field-group");
  });
}

let parameterWriteState: "" | "Saving" | "Saved" | "Failed" = "";
async function writeParameter(entityId: string, parameter: Clip["inspector"][number], replacement: CanonicalValue): Promise<void> {
  const state = store.current();
  if (state === undefined) return;
  parameterWriteState = "Saving";
  status.title = "";
  status.textContent = parameterWriteState;
  status.className = "status saving";
  try {
    await applyStudioMutation({
      type: "parameter.adjust",
      revision: state.snapshot.revision,
      entityId,
      parameterId: parameter.id,
      value: replacement,
    });
    parameterWriteState = "Saved";
    status.textContent = parameterWriteState;
    status.className = "status saved";
  } catch (error) {
    // Validation and stale-revision rejections do not publish a new snapshot.
    // Restore the accepted value just as a rejected compilation does.
    restoreParameterControls(entityId);
    parameterWriteState = "Failed";
    status.textContent = error instanceof Error ? "Save failed" : parameterWriteState;
    status.className = "status error";
    status.title = error instanceof Error ? error.message : String(error);
  }
}

/**
 * A single strip between the picture and the timeline. It is a row of the
 * layout rather than a floating card, so it can never cover the frame being
 * inspected or the transport used to reach it.
 */
function renderInspector(snapshot: StudioSnapshot, clipId: string | undefined): void {
  const clip = clipId === undefined ? undefined : store.clip(clipId);

  if (clip === undefined) {
    defaultWorkspaceHeading();
    const fps = snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;
    inspector.replaceChildren(
      group("Project", [
        property("Author", snapshot.source.path, "property-code"),
        property("Run", snapshot.run.path, "property-code"),
        property("Sources", `${snapshot.source.files.length} referenced files`),
        property("Tracks", String(snapshot.tracks.length), "property-number"),
      ]),
      group("Canvas", [
        property("Resolution", `${snapshot.space.canvasWidth} × ${snapshot.space.canvasHeight}`, "property-number"),
        property("Aspect ratio", aspectRatio(snapshot.space.canvasWidth, snapshot.space.canvasHeight), "property-number"),
      ]),
      group("Timeline", [
        property("Duration", `${snapshot.space.durationSec.toFixed(2)} s`, "property-number"),
        property("Frame rate", `${fps.toFixed(Number.isInteger(fps) ? 0 : 2)} fps`, "property-number"),
        property("Frames", String(snapshot.space.frameCount), "property-number"),
      ]),
      group("Build", [
        property("Targets", snapshot.run.targets
          .map((target) => target.split("::output::").at(-1) ?? target)
          .join(", ") || "—", "property-code"),
        property("Candidates", String(snapshot.run.satisfactions.length), "property-number"),
      ]),
    );
    return;
  }
  const domains = domainOrder.filter((domain) => clip.inspector.some((field) => field.domain === domain));
  if (domains.length === 0) {
    defaultWorkspaceHeading();
    const empty = document.createElement("div");
    empty.className = "inspector-empty";
    empty.textContent = "No adjustable parameters";
    inspector.replaceChildren(empty);
    return;
  }
  const remembered = inspectorDomainByEntity.get(clip.id);
  const activeDomain = remembered !== undefined && domains.includes(remembered) ? remembered : domains[0]!;
  inspectorDomainByEntity.set(clip.id, activeDomain);
  inspectorHeading(clip.id, domains, activeDomain, () => renderInspector(snapshot, clip.id));

  const domainFields = clip.inspector.filter((field) => field.domain === activeDomain);
  const pages = new Map<string, { readonly label: string; readonly fields: typeof domainFields }>();
  for (const field of domainFields) {
    const id = field.page?.id ?? "default";
    const page = pages.get(id) ?? { label: field.page?.label ?? "", fields: [] };
    pages.set(id, { ...page, fields: [...page.fields, field] });
  }
  const pageIds = [...pages.keys()];
  const memoryKey = `${clip.id}:${activeDomain}`;
  const rememberedPage = inspectorPageByEntity.get(memoryKey);
  const activePage = rememberedPage !== undefined && pages.has(rememberedPage) ? rememberedPage : pageIds[0]!;
  inspectorPageByEntity.set(memoryKey, activePage);
  const page = pages.get(activePage)!;
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
        inspectorPageByEntity.set(memoryKey, id);
        renderInspector(snapshot, clip.id);
      });
      return button;
    }));
  }
  inspector.replaceChildren(...(pageIds.length > 1 ? [subtabs] : []), ...parameterGroups(clip.id, page.fields));
}

function renderSemanticInspector(snapshot: StudioSnapshot, segmentId: string): void {
  const segment = snapshot.semantic?.segments.find((item) => item.id === segmentId);
  if (segment === undefined) { inspector.replaceChildren(); return; }
  defaultWorkspaceHeading();
  const empty = document.createElement("div");
  empty.className = "inspector-empty";
  empty.textContent = "No adjustable parameters";
  inspector.replaceChildren(empty);
}

/** Exact identity choice for coincident anchors, through the same Companion-declared handles. */
function semanticAnchorInspector(snapshot: StudioSnapshot, kind: "selection" | "moment", id: string): HTMLElement {
  const semantic = snapshot.semantic;
  const consumers = snapshot.tracks.flatMap((track) => track.clips).flatMap((clip) => clip.editHandles
    .filter((handle) => handle.enabled && handle.semantic?.kind === kind && handle.semantic.id === id)
    .map((handle) => ({ clip, handle })));
  const current = kind === "selection" ? semantic?.selections.find((item) => item.id === id)
    : semantic?.moments.find((item) => item.id === id);
  if (!semantic || !current) return group("Timing", []);
  const endpoints = "anchorId" in current ? [["Moment", current.anchorId]]
    : [["Start", current.startAnchorId], ["End", current.endAnchorId]];
  return group("Semantic anchors", endpoints.map(([label, anchorId]) => {
    const anchor = semantic.anchors.find((item) => item.id === anchorId)!;
    const describe = (item: typeof anchor) => {
      const word = semantic.tokens.find((token) => token.id === item.tokenId)?.text;
      return `${item.kind.replaceAll("-", " ")}${word ? ` · ${word}` : ""}${item.segmentId ? ` · ${item.segmentId}` : ""}`;
    };
    const candidates = semantic.anchors.filter((item) => item.frame === anchor.frame).flatMap((item) => {
      const target: SemanticTarget = "anchorId" in current ? { kind: "moment", anchorId: item.id }
        : { kind: "selection", startAnchorId: label === "Start" ? item.id : current.startAnchorId,
            endAnchorId: label === "End" ? item.id : current.endAnchorId };
      const owner = consumers.find(({ handle }) => semanticGestureSpan(semantic.anchors, handle, target) !== undefined);
      return owner ? [{ item, target, ...owner }] : [];
    });
    if (candidates.length < 2) return property(label!, describe(anchor));
    const row = document.createElement("label");
    row.className = "property";
    const name = document.createElement("span");
    name.textContent = label!;
    const control = document.createElement("select");
    control.className = "parameter-value";
    control.setAttribute("aria-label", `${label} semantic anchor`);
    for (const { item } of candidates) {
      const option = document.createElement("option"); option.value = item.id; option.textContent = describe(item);
      control.append(option);
    }
    control.value = anchorId!;
    control.addEventListener("change", () => {
      const choice = candidates.find(({ item }) => item.id === control.value)!;
      const span = semanticGestureSpan(semantic.anchors, choice.handle, choice.target)!;
      const temporal = choice.handle.temporal!;
      control.disabled = true;
      status.textContent = "Saving"; status.className = "status saving";
      void applyStudioMutation({ type: "timeline.adjust", revision: snapshot.revision,
        entityId: choice.clip.id, gesture: choice.handle.gesture,
        target: temporal.kind === "instant" ? { kind: "instant", frame: span.startFrame, semantic: choice.target }
          : { kind: "window", ...span, semantic: choice.target },
      }).then(() => { status.textContent = "Saved"; status.className = "status saved"; })
        .catch((error: unknown) => {
          control.value = anchorId!; status.textContent = "Save failed"; status.className = "status error";
          status.title = error instanceof Error ? error.message : String(error);
        }).finally(() => { control.disabled = false; });
    });
    row.append(name, control);
    return row;
  }));
}

function renderSemanticSelectionInspector(snapshot: StudioSnapshot, selectionId: string): void {
  const selection = snapshot.semantic?.selections.find((item) => item.id === selectionId);
  if (selection === undefined) { inspector.replaceChildren(); return; }
  defaultWorkspaceHeading();
  inspector.replaceChildren(semanticAnchorInspector(snapshot, "selection", selectionId));
}

function renderSemanticMomentInspector(snapshot: StudioSnapshot, momentId: string): void {
  const moment = snapshot.semantic?.moments.find((item) => item.id === momentId);
  if (moment === undefined) { inspector.replaceChildren(); return; }
  defaultWorkspaceHeading();
  inspector.replaceChildren(semanticAnchorInspector(snapshot, "moment", momentId));
}

// The word being spoken at the playhead, which is the point of carrying token
// timings at all: it ties the Script text to the frame on screen.
store.subscribe(({ snapshot, playhead }) => {
  const token = snapshot.script?.tokens.find((item) =>
    playhead.frame >= item.startFrame && playhead.frame < item.endFrame);
  code.speak(token?.range);
});

let described = "";
let scrolledTo = "";

store.subscribe(({ snapshot, selection, playhead }) => {
  const origin = selection.kind === "none" ? undefined : selection.origin;
  const chosen = selection.kind === "clip" ? store.clip(selection.clipId) : undefined;
  const chosenSegment = selection.kind === "semantic-segment"
    ? snapshot.semantic?.segments.find((item) => item.id === selection.segmentId)
    : undefined;
  const chosenSelection = selection.kind === "semantic-selection"
    ? snapshot.semantic?.selections.find((item) => item.id === selection.selectionId)
    : undefined;
  const chosenMoment = selection.kind === "semantic-moment"
    ? snapshot.semantic?.moments.find((item) => item.id === selection.momentId)
    : undefined;
  // Rebuilding this every frame of playback would be DOM churn for no change.
  const describes = `${snapshot.revision}:${selection.kind}:${chosen?.id ?? chosenSegment?.id ?? chosenSelection?.id ?? chosenMoment?.id ?? ""}`;
  if (describes !== described) {
    described = describes;
    if (chosenSegment !== undefined) renderSemanticInspector(snapshot, chosenSegment.id);
    else if (chosenSelection !== undefined) renderSemanticSelectionInspector(snapshot, chosenSelection.id);
    else if (chosenMoment !== undefined) renderSemanticMomentInspector(snapshot, chosenMoment.id);
    else renderInspector(snapshot, chosen?.id);
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
  if (chosen?.elementRange !== undefined) {
    highlights.push({ range: chosen.elementRange, tone: "element" });
  }
  if (chosenSegment?.range !== undefined) {
    highlights.push({ range: chosenSegment.range, tone: "element" });
  }
  const sourceSelection = chosenSelection === undefined
    ? undefined
    : snapshot.script?.selections.find((item) => item.id === chosenSelection.id);
  const sourceMoment = chosenMoment === undefined
    ? undefined
    : snapshot.script?.moments.find((item) => item.id === chosenMoment.id);
  const chosenIntentRange = sourceSelection === undefined
    ? sourceMoment?.range
    : { start: sourceSelection.open.start, end: sourceSelection.close.end };
  if (chosenIntentRange !== undefined) highlights.push({ range: chosenIntentRange, tone: "binding" });

  // Scroll only when the selection actually moved, and never toward the pane
  // the author is pointing at: following the playhead every frame would drag
  // the source out from under whoever is reading it.
  const focused = chosen === undefined && chosenSegment === undefined
    && chosenSelection === undefined && chosenMoment === undefined
    ? ""
    : `${snapshot.revision}:${selection.kind}:${chosen?.id ?? chosenSegment?.id ?? chosenSelection?.id ?? chosenMoment?.id}`;
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
  const intent = intentAtOffset(state.snapshot, offset);
  if (intent?.kind === "selection") {
    store.selectSemanticSelection(intent.id, "code");
    return;
  }
  if (intent?.kind === "moment") {
    store.selectSemanticMoment(intent.id, "code");
    return;
  }
  const clip = clipAtOffset(state.snapshot, offset);

  // A click inside marked prose lands inside the innermost marker written there,
  // not at the start of whatever encloses it. `@amount` places nothing, so
  // resolving through clips alone would throw the playhead out to `@fee`.
  const span = spanAtOffset(state.snapshot, offset);
  // Prose is anywhere a marker was written; whether a clip also covers that
  // offset only decides which clip to select, not whether the click counts.
  const inProse = span !== undefined
    && (clip?.elementRange === undefined
      || !(offset >= clip.elementRange.start && offset <= clip.elementRange.end));
  if (inProse) {
    // A clip is named after itself and remembers what placed it, so a marker
    // finds the clips it put there through the second, not the first.
    const bound = state.snapshot.tracks
      .flatMap((track) => track.clips)
      .find((item) => item.markerId === span.id || item.authoredId === span.id);
    // A marker that places nothing still sits inside one that does, so the
    // enclosing clip stays selected rather than leaving the inspector blank.
    const target = bound?.id ?? clip?.id;
    if (target === undefined) store.seek(span.startFrame, "code");
    else store.focus(span.startFrame, target, "code");
    return;
  }
  if (clip === undefined) store.clearSelection();
  else store.selectClip(clip.id, "code");
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
  else if (event.key === "End") store.seek(state.snapshot.space.frameCount - 1, "timeline");
  else if (event.key === "Escape") store.clearSelection();
  else return;
  event.preventDefault();
});

function applySnapshot(snapshot: StudioSnapshot): void {
  failureView.textContent = "";
  status.className = "status";
  status.title = "";
  status.textContent = "";
  renderMeta(snapshot);
  library.show(snapshot);
  store.load(snapshot);
}

function applyFailure(failure: StudioFailure): void {
  status.className = "status error";
  status.textContent = "Compile failed";
  failureView.textContent = failure.error;
  if (failure.range !== undefined) code.highlight([{ range: failure.range, tone: "element" }], true);
  // A parameter control changes immediately in the browser, but the source
  // remains the only truth. If recompilation rejects the transaction, rebuild
  // the Inspector from the last accepted snapshot instead of leaving a false
  // value visible in the field.
  const current = store.current();
  if (current === undefined) return;
  if (current.selection.kind === "clip") renderInspector(current.snapshot, current.selection.clipId);
  else if (current.selection.kind === "semantic-segment") renderSemanticInspector(current.snapshot, current.selection.segmentId);
  else if (current.selection.kind === "semantic-selection") renderSemanticSelectionInspector(current.snapshot, current.selection.selectionId);
  else if (current.selection.kind === "semantic-moment") renderSemanticMomentInspector(current.snapshot, current.selection.momentId);
}

const response = await fetch("/__studio/session");
const initial = await response.json() as StudioSnapshot | StudioFailure;
if (response.ok && "tracks" in initial) applySnapshot(initial);
else applyFailure(initial as StudioFailure);

type Hot = { on(event: string, listener: (value: unknown) => void): void };
const hot = (import.meta as ImportMeta & { hot?: Hot }).hot;
hot?.on("studio:snapshot", (value) => applySnapshot(value as StudioSnapshot));
hot?.on("studio:error", (value) => applyFailure(value as StudioFailure));
