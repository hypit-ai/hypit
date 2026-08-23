import type { Clip, StudioFailure, StudioSnapshot } from "../shared.js";
import { createCodePane } from "./code.js";
import { setIcon } from "./icons.js";
import { createHandle } from "./resize.js";
import type { Highlight } from "./code.js";
import { intentAtOffset, spanAtOffset } from "./markers.js";
import { clipAtOffset, createStore } from "./selection.js";
import { createStage } from "./stage.js";
import { writeSourceTransaction } from "./writeback.js";
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
      <aside class="source-panel" data-code></aside>
      <div class="preview-panel" data-stage></div>
      <aside class="workspace-panel">
        <div class="pane-heading workspace-heading">
          <div class="pane-tabs" role="tablist" aria-label="Inspector views">
            <button type="button" class="pane-tab active" role="tab" aria-selected="true">Properties</button>
          </div>
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
const timeline = createTimeline(store);
const stage = createStage(store);
app.querySelector<HTMLElement>("[data-code]")!.append(code.element);
app.querySelector<HTMLElement>("[data-timeline]")!.append(timeline.element);
app.querySelector<HTMLElement>("[data-stage]")!.append(stage.element);

// The source, picture, workspace and timeline all need different amounts of
// room for different jobs, so each boundary is draggable and remembered.
const shell = app.querySelector<HTMLElement>(".studio-shell")!;
const upperShell = app.querySelector<HTMLElement>(".upper-shell")!;
const workspacePanel = app.querySelector<HTMLElement>(".workspace-panel")!;
const sourceHandle = createHandle({
  axis: "column", initial: Math.round(window.innerWidth * 0.34), minimum: 280,
  maximum: () => Math.max(360, upperShell.clientWidth - 720),
  apply: (size) => { upperShell.style.setProperty("--source-width", `${size}px`); },
  remember: "hypit-studio.v3.source-width",
});
sourceHandle.classList.add("source-handle");
upperShell.insertBefore(sourceHandle, app.querySelector<HTMLElement>("[data-stage]")!);
const workspaceHandle = createHandle({
  axis: "column", initial: Math.round(window.innerWidth * 0.22), minimum: 270, invert: true,
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

function parameterControl(parameter: Clip["parameters"][number]): HTMLElement {
  const row = document.createElement("label");
  row.className = `parameter-row${parameter.writable ? " parameter-editable" : " parameter-readonly"}`;
  const name = document.createElement("span");
  name.className = "parameter-label";
  name.textContent = parameter.label;
  const source = document.createElement("small");
  source.className = "parameter-source";
  source.textContent = `${parameter.language.toUpperCase()} · ${parameter.source.path}:${parameter.source.range.start}`;
  source.title = parameter.disabledReason ?? parameter.source.preimage;
  const value = parameter.writable
    ? document.createElement(parameter.control === "select" ? "select" : "input")
    : document.createElement("strong");
  value.className = "parameter-value";
  if (value instanceof HTMLInputElement) {
    value.type = parameter.control === "number" ? "number" : parameter.control === "boolean" ? "checkbox" : "text";
    if (value.type === "checkbox") value.checked = parameter.value === "true";
    else value.value = parameter.value;
    value.dataset.parameterId = parameter.id;
    value.title = parameter.source.preimage;
    value.addEventListener("change", () => {
      void writeParameter(parameter, value.type === "checkbox" ? String(value.checked) : value.value);
    });
  } else if (value instanceof HTMLSelectElement) {
    for (const option of parameter.options ?? []) {
      const item = document.createElement("option");
      item.value = option;
      item.textContent = option;
      item.selected = option === parameter.value;
      value.append(item);
    }
    value.addEventListener("change", () => void writeParameter(parameter, value.value));
  } else {
    value.textContent = parameter.value;
    value.title = parameter.disabledReason ?? parameter.source.preimage;
  }
  const suffix = parameter.unit === undefined ? "" : ` ${parameter.unit}`;
  const right = document.createElement("span");
  right.className = "parameter-right";
  right.append(value);
  if (suffix.length > 0) {
    const unit = document.createElement("small");
    unit.textContent = suffix;
    right.append(unit);
  }
  row.append(name, right, source);
  if (!parameter.writable) row.title = parameter.disabledReason ?? "Read-only source parameter";
  return row;
}

function parameterGroups(parameters: readonly Clip["parameters"][number][]): readonly HTMLElement[] {
  type StudioParameterValue = Clip["parameters"][number];
  const groups = new Map<string, StudioParameterValue[]>();
  for (const parameter of parameters) {
    const key = `${parameter.language}\u0000${parameter.source.path}`;
    const held = groups.get(key) ?? [];
    held.push(parameter);
    groups.set(key, held);
  }
  return [...groups].map(([key, values]) => {
    const [language, path = ""] = key.split("\u0000");
    const title = path.length === 0 ? language!.toUpperCase() : `${language!.toUpperCase()} · ${path}`;
    return group(title, values.map(parameterControl), "parameter-group");
  });
}

const operationLabels: Readonly<Record<Clip["editHandles"][number]["operation"], string>> = {
  move: "Move",
  "trim-start": "Trim start",
  "trim-end": "Trim end",
  slip: "Slip",
  split: "Split",
  delete: "Delete",
  duplicate: "Duplicate",
  "canvas-transform": "Canvas transform",
};

const operationCoordinateLabels: Readonly<Record<NonNullable<Clip["editHandles"][number]["coordinate"]>, string>> = {
  "program-frame": "program frames",
  "source-frame": "source frames",
  "canvas-pixel": "canvas pixels",
  "normalized-progress": "normalized progress",
};

function operationGroups(handles: readonly Clip["editHandles"][number][]): readonly HTMLElement[] {
  if (handles.length === 0) return [];
  return [group("Timeline operations", handles.map((handle) => {
    const node = document.createElement("div");
    node.className = `operation-row${handle.enabled ? " operation-enabled" : " operation-disabled"}`;
    const copy = document.createElement("span");
    copy.className = "operation-copy";
    const label = document.createElement("strong");
    label.className = "operation-label";
    label.textContent = operationLabels[handle.operation];
    const detail = document.createElement("small");
    detail.className = "operation-detail";
    const coordinate = handle.coordinate === undefined ? "" : operationCoordinateLabels[handle.coordinate];
    const snap = handle.snapTo === undefined || handle.snapTo.length === 0
      ? ""
      : `snap ${handle.snapTo.join(" · ")}`;
    const source = handle.sources === undefined || handle.sources.length === 0
      ? ""
      : handle.sources.map((item) => `${item.role} → ${item.source.path}:${item.source.range.start}`).join(" · ");
    detail.textContent = [coordinate, snap, source].filter((value) => value.length > 0).join(" · ");
    copy.append(label, detail);
    const state = document.createElement("strong");
    state.className = "operation-state";
    state.textContent = handle.enabled ? "Timeline" : "—";
    node.title = handle.disabledReason
      ?? (handle.enabled ? "按时间线把手操作，成功后会回写源文件。" : "当前实体没有可逆的 Studio 写回。" );
    node.append(copy, state);
    return node;
  }), "operation-group")];
}

let parameterWriteState: "" | "Saving" | "Saved" | "Failed" = "";
async function writeParameter(parameter: Clip["parameters"][number], replacement: string): Promise<void> {
  const state = store.current();
  if (state === undefined || !parameter.writable) return;
  parameterWriteState = "Saving";
  status.textContent = parameterWriteState;
  status.className = "status saving";
  try {
    await writeSourceTransaction(state.snapshot.revision, [{
      path: parameter.source.path,
      range: parameter.source.range,
      replacement,
      preimage: parameter.source.preimage,
    }]);
    parameterWriteState = "Saved";
    status.textContent = parameterWriteState;
    status.className = "status saved";
  } catch (error) {
    parameterWriteState = "Failed";
    status.textContent = error instanceof Error ? "Save failed" : parameterWriteState;
    status.className = "status error";
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
    inspector.replaceChildren();
    return;
  }

  const fps = snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;
  const durationFrames = clip.endFrameExclusive - clip.startFrame;
  const track = snapshot.tracks.find((item) => item.clips.some((candidate) => candidate.id === clip.id));
  const hero = document.createElement("div");
  hero.className = "selection-hero";
  hero.innerHTML = `
    <span class="selection-icon" data-selection-icon></span>
    <div class="selection-title"><strong></strong><small></small></div>
    <span class="selection-kind"></span>`;
  setIcon(hero.querySelector("[data-selection-icon]")!, track?.binding.icon ?? "component");
  hero.querySelector(".selection-kind")!.textContent = track === undefined
    ? "Track"
    : `${track.binding.family} · ${track.binding.facet}`;
  hero.querySelector("strong")!.textContent = clip.label;
  hero.querySelector("small")!.textContent = track?.label ?? "Visual track";

  const timing = group("Timing", [
    property("Start", `${clip.startFrame}f`, "property-number"),
    property("End", `${clip.endFrameExclusive}f`, "property-number"),
    property("Duration", `${durationFrames}f`, "property-number"),
    property("Seconds", `${(durationFrames / fps).toFixed(2)}s`, "property-number"),
  ]);
  const placement = group("Placement", [
    property("Track", track?.label ?? "—", "property-wide"),
    property("Type", track === undefined ? clip.presentation.entity : `${track.binding.family} / ${track.binding.facet}`),
    property("Item", clip.authoredId, "property-wide property-code"),
  ]);
  const source = clip.temporal === undefined ? undefined : group("Binding", [
    property("Source", `${clip.temporal.source.kind}${clip.temporal.source.id === undefined ? "" : ` · ${clip.temporal.source.id}`}`, "property-wide property-code"),
    ...(clip.temporal.projection === undefined ? []
      : clip.temporal.projection.kind === "point"
        ? [property("At", clip.temporal.projection.expression, "property-wide property-code")]
        : [
            property("From", clip.temporal.projection.startExpression, "property-wide property-code"),
            property("To", clip.temporal.projection.endExpression, "property-wide property-code"),
          ]),
  ]);
  const run = track === undefined ? undefined : group("Run", [
    property("Run", snapshot.run.path, "property-wide property-code"),
    property("Target", snapshot.run.targets.join(", "), "property-wide property-code"),
    property("Output", track.provenance.output, "property-wide property-code"),
    ...(track.provenance.candidateId === undefined ? [] : [
      property("Candidate", track.provenance.candidateId, "property-wide property-code"),
    ]),
    property("Status", track.provenance.status),
    property("Writeback", "Run source · read-only"),
  ]);
  const operations = operationGroups(clip.editHandles);
  const parameters = parameterGroups(clip.parameters);
  inspector.replaceChildren(hero, placement, timing, ...operations, ...parameters,
    ...(source === undefined ? [] : [source]), ...(run === undefined ? [] : [run]));
}

function renderSemanticInspector(snapshot: StudioSnapshot, segmentId: string): void {
  const segment = snapshot.semantic.segments.find((item) => item.id === segmentId);
  if (segment === undefined) { inspector.replaceChildren(); return; }
  const fps = snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;
  const durationFrames = segment.endFrameExclusive - segment.startFrame;
  const hero = document.createElement("div");
  hero.className = "selection-hero";
  hero.innerHTML = `
    <span class="selection-icon" data-selection-icon></span>
    <div class="selection-title"><strong></strong><small></small></div>
    <span class="selection-kind">Speech</span>`;
  setIcon(hero.querySelector("[data-selection-icon]")!, snapshot.semantic.presentation.icon);
  hero.querySelector("strong")!.textContent = segment.id;
  hero.querySelector("small")!.textContent = "Semantic take";
  inspector.replaceChildren(hero, group("Timing", [
    property("Start", `${segment.startFrame}f`, "property-number"),
    property("End", `${segment.endFrameExclusive}f`, "property-number"),
    property("Duration", `${durationFrames}f`, "property-number"),
    property("Seconds", `${(durationFrames / fps).toFixed(2)}s`, "property-number"),
  ]));
}

function renderSemanticSelectionInspector(snapshot: StudioSnapshot, selectionId: string): void {
  const selection = snapshot.semantic.selections.find((item) => item.id === selectionId);
  if (selection === undefined) { inspector.replaceChildren(); return; }
  const fps = snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;
  const durationFrames = selection.endFrameExclusive - selection.startFrame;
  const source = snapshot.script?.selections.find((item) => item.id === selectionId);
  const hero = document.createElement("div");
  hero.className = "selection-hero";
  hero.innerHTML = `
    <span class="selection-icon" data-selection-icon></span>
    <div class="selection-title"><strong></strong><small></small></div>
    <span class="selection-kind">Selection</span>`;
  setIcon(hero.querySelector("[data-selection-icon]")!, "link");
  hero.querySelector("strong")!.textContent = selection.id;
  hero.querySelector("small")!.textContent = "Author intent";
  inspector.replaceChildren(hero,
    group("Timing", [
      property("Start", `${selection.startFrame}f`, "property-number"),
      property("End", `${selection.endFrameExclusive}f`, "property-number"),
      property("Duration", `${durationFrames}f`, "property-number"),
      property("Seconds", `${(durationFrames / fps).toFixed(2)}s`, "property-number"),
    ]),
    ...(source === undefined ? [] : [group("Source", [
      property("Range", `${source.open.start}–${source.close.end}`, "property-wide property-code"),
    ])]),
  );
}

function renderSemanticMomentInspector(snapshot: StudioSnapshot, momentId: string): void {
  const moment = snapshot.semantic.moments.find((item) => item.id === momentId);
  if (moment === undefined) { inspector.replaceChildren(); return; }
  const fps = snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;
  const source = snapshot.script?.moments.find((item) => item.id === momentId);
  const hero = document.createElement("div");
  hero.className = "selection-hero";
  hero.innerHTML = `
    <span class="selection-icon" data-selection-icon></span>
    <div class="selection-title"><strong></strong><small></small></div>
    <span class="selection-kind">Moment</span>`;
  setIcon(hero.querySelector("[data-selection-icon]")!, "moment");
  hero.querySelector("strong")!.textContent = moment.id;
  hero.querySelector("small")!.textContent = "Author intent";
  inspector.replaceChildren(hero,
    group("Timing", [
      property("Frame", `${moment.frame}f`, "property-number"),
      property("Seconds", `${(moment.frame / fps).toFixed(2)}s`, "property-number"),
    ]),
    ...(source === undefined ? [] : [group("Source", [
      property("Range", `${source.range.start}–${source.range.end}`, "property-wide property-code"),
    ])]),
  );
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
    ? snapshot.semantic.segments.find((item) => item.id === selection.segmentId)
    : undefined;
  const chosenSelection = selection.kind === "semantic-selection"
    ? snapshot.semantic.selections.find((item) => item.id === selection.selectionId)
    : undefined;
  const chosenMoment = selection.kind === "semantic-moment"
    ? snapshot.semantic.moments.find((item) => item.id === selection.momentId)
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
  const editing = target?.closest("input, textarea, select") !== null && target !== undefined;
  if (event.key === " " && !editing) {
    stage.toggle();
    event.preventDefault();
    return;
  }
  if (!editing && (event.key === "-" || event.key === "_")) {
    timeline.zoomOut();
    event.preventDefault();
    return;
  }
  if (!editing && (event.key === "=" || event.key === "+")) {
    timeline.zoomIn();
    event.preventDefault();
    return;
  }
  if (!editing && (event.key === "\\" || event.key.toLowerCase() === "f")) {
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
  status.textContent = "";
  renderMeta(snapshot);
  code.show(snapshot);
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
