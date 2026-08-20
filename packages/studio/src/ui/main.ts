import type { StudioFailure, StudioSnapshot } from "../shared.js";
import { createCodePane } from "./code.js";
import { createHandle } from "./resize.js";
import type { Highlight } from "./code.js";
import { liveRanges, markerTones, spanAtOffset } from "./markers.js";
import { clipAtOffset, createStore } from "./selection.js";
import { createStage } from "./stage.js";
import { createTimeline } from "./timeline.js";
import "../style.css";

const app = document.querySelector<HTMLElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">H</span>
      <div><strong>Hypit Studio</strong><small>SVML workspace</small></div>
    </div>
    <div class="project-title" data-project></div>
    <div class="meta" data-meta></div>
    <div class="badges" data-badges></div>
    <div class="status" data-status><i></i><span>Reading…</span></div>
  </header>
  <main class="studio-shell">
    <aside class="source-panel" data-code></aside>
    <section class="workbench">
      <div class="preview-row">
        <div class="preview-panel" data-stage></div>
        <aside class="workspace-panel">
          <div class="pane-heading workspace-heading">
            <div class="pane-title">
              <span class="material-symbols-rounded pane-icon">tune</span>
              <div><h2>Inspector</h2><span>Selected item</span></div>
            </div>
          </div>
          <div class="workspace-scroll">
            <section class="workspace-section">
              <div class="inspector" data-inspector></div>
            </section>
          </div>
        </aside>
      </div>
      <div class="timeline-panel" data-timeline></div>
    </section>
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
const workbench = app.querySelector<HTMLElement>(".workbench")!;
const previewRow = app.querySelector<HTMLElement>(".preview-row")!;
const workspacePanel = app.querySelector<HTMLElement>(".workspace-panel")!;
const sourceHandle = createHandle({
  axis: "column", initial: 390, minimum: 280,
  maximum: () => Math.max(320, shell.clientWidth - 760),
  apply: (size) => { shell.style.setProperty("--source-width", `${size}px`); },
  remember: "hypit-studio.source-width",
});
sourceHandle.classList.add("source-handle");
shell.insertBefore(sourceHandle, workbench);
const workspaceHandle = createHandle({
  axis: "column", initial: 300, minimum: 240, invert: true,
  maximum: () => Math.max(260, previewRow.clientWidth - 360),
  apply: (size) => { previewRow.style.setProperty("--workspace-width", `${size}px`); },
  remember: "hypit-studio.workspace-width",
});
workspaceHandle.classList.add("workspace-handle");
previewRow.insertBefore(workspaceHandle, workspacePanel);
workbench.insertBefore(createHandle({
  axis: "row", initial: 330, minimum: 176, invert: true,
  maximum: () => Math.max(220, workbench.clientHeight - 260),
  apply: (size) => { workbench.style.setProperty("--timeline-height", `${size}px`); },
  remember: "hypit-studio.timeline-height",
}), app.querySelector<HTMLElement>("[data-timeline]")!);
const inspector = app.querySelector<HTMLElement>("[data-inspector]")!;
const meta = app.querySelector<HTMLElement>("[data-meta]")!;
const project = app.querySelector<HTMLElement>("[data-project]")!;
const badges = app.querySelector<HTMLElement>("[data-badges]")!;
const status = app.querySelector<HTMLElement>("[data-status]")!;
const failureView = app.querySelector<HTMLElement>("[data-failure]")!;

function renderBadges(_snapshot: StudioSnapshot): void {
  badges.replaceChildren();
}

// Program-level facts never change while a Source is being read, so they live in
// the header rather than taking a panel that would have to sit over something.
function renderMeta(snapshot: StudioSnapshot): void {
  const { space } = snapshot;
  project.textContent = snapshot.source.path.split("/").at(-1) ?? snapshot.source.path;
  project.title = snapshot.source.path;
  meta.textContent = [
    `${space.canvasWidth}x${space.canvasHeight}`,
    `${space.frameRate.numerator}/${space.frameRate.denominator}fps`,
    `${space.durationSec.toFixed(2)}s`,
  ].join("  ·  ");
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

/**
 * A single strip between the picture and the timeline. It is a row of the
 * layout rather than a floating card, so it can never cover the frame being
 * inspected or the transport used to reach it.
 */
function renderInspector(snapshot: StudioSnapshot, clipId: string | undefined): void {
  const clip = clipId === undefined ? undefined : store.clip(clipId);

  if (clip === undefined) {
    const empty = document.createElement("div");
    empty.className = "inspector-empty";
    empty.innerHTML = `<span class="material-symbols-rounded">select</span><strong>Nothing selected</strong><small>Choose a clip, source marker, or object in the preview.</small>`;
    inspector.replaceChildren(empty);
    return;
  }

  const fps = snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;
  const durationFrames = clip.endFrameExclusive - clip.startFrame;
  const track = snapshot.tracks.find((item) => item.clips.some((candidate) => candidate.id === clip.id));
  const hero = document.createElement("div");
  hero.className = "selection-hero";
  hero.innerHTML = `
    <span class="selection-icon"><span class="material-symbols-rounded">widgets</span></span>
    <div class="selection-title"><strong></strong><small></small></div>
    <span class="selection-kind">Visual</span>`;
  hero.querySelector("strong")!.textContent = clip.label;
  hero.querySelector("small")!.textContent = track?.label ?? "Visual track";

  const timing = group("Timing", [
    property("Start", `${clip.startFrame}f`),
    property("End", `${clip.endFrameExclusive}f`),
    property("Duration", `${durationFrames}f`),
    property("Seconds", `${(durationFrames / fps).toFixed(2)}s`),
  ]);
  const identity = group("Binding", [
    property("Authored id", clip.authoredId, "property-wide property-code"),
    ...(clip.markerId === undefined
      ? []
      : [property("Script marker", clip.markerId, "property-wide property-code")]),
    property("Present id", clip.id, "property-wide property-code"),
  ]);
  const composition = group("Composition", [
    property("Track", track?.label ?? "—", "property-wide"),
    property("Stack order", String(clip.stackOrder)),
    property("Source", track?.provenance.origin ?? "source"),
  ]);
  const run = group("Run provenance", [
    property("Output", track?.provenance.output ?? "—", "property-wide property-code"),
    property("Candidate", track?.provenance.candidateId ?? "—", "property-wide property-code"),
    property("Origin", track?.provenance.origin ?? "none"),
    property("Status", track?.provenance.status ?? "unresolved"),
    ...(track === undefined || track.provenance.errors.length === 0
      ? []
      : [property("Error", track.provenance.errors.join(" "), "property-wide property-code")]),
  ]);
  const sections: HTMLElement[] = [hero, timing, composition, identity, run];
  inspector.replaceChildren(...sections);
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
  const origin = selection.kind === "clip" ? selection.origin : undefined;
  const chosen = selection.kind === "clip" ? store.clip(selection.clipId) : undefined;
  // Rebuilding this every frame of playback would be DOM churn for no change.
  const describes = `${snapshot.revision}:${chosen?.id ?? ""}`;
  if (describes !== described) {
    described = describes;
    renderInspector(snapshot, chosen?.id);
  }

  // Every Selection the playhead is inside is outlined, not only what was
  // clicked, and not only what has a clip. A Selection inside another Selection
  // is still inside it, so the enclosing pair stays outlined while the inner one
  // is — that nesting is the whole point of the markers.
  const tones = markerTones(snapshot);
  const live = store.clipsAt(playhead.frame);
  const highlights: Highlight[] = liveRanges(snapshot, playhead.frame).map((selection) => ({
    range: selection.range,
    tone: "binding" as const,
    depth: tones.get(selection.id) ?? 0,
  }));
  // The element that placed what is on screen is outlined too. Knowing a cutaway
  // is running is half the answer; the other half is which line put it there.
  // Only what was chosen is outlined. What is merely drawn at this frame is
  // already said by the gutter bars, and a second outline for it made a board
  // look picked when one of its rows was.
  if (chosen?.elementRange !== undefined) {
    highlights.push({ range: chosen.elementRange, tone: "element" });
  }

  // Scroll only when the selection actually moved, and never toward the pane
  // the author is pointing at: following the playhead every frame would drag
  // the source out from under whoever is reading it.
  const focused = chosen === undefined ? "" : `${snapshot.revision}:${chosen.id}`;
  const moved = focused.length > 0 && focused !== scrolledTo;
  scrolledTo = focused;
  code.highlight(highlights, moved && origin !== "code");
});

// Clicking a marked region in the source selects what it binds and looks at the
// instant it covers. The lines that bind something carry a coloured gutter bar,
// so what is clickable is visible standing still.
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
  const editing = (event.target as HTMLElement | null)?.closest("input, textarea, select") !== null;
  if (event.key === " " && !editing) {
    stage.toggle();
    event.preventDefault();
    return;
  }
  const step = event.shiftKey ? 10 : 1;
  if (event.key === "ArrowLeft") store.seek(state.playhead.frame - step, "timeline");
  else if (event.key === "ArrowRight") store.seek(state.playhead.frame + step, "timeline");
  else if (event.key === "Home") store.seek(0, "timeline");
  else if (event.key === "End") store.seek(state.snapshot.space.frameCount - 1, "timeline");
  else if (event.key === "Escape") store.clearSelection();
  else return;
  event.preventDefault();
});

function applySnapshot(snapshot: StudioSnapshot): void {
  failureView.textContent = "";
  status.className = "status ok";
  status.innerHTML = `<i></i><span>Live · r${snapshot.revision}</span>`;
  renderMeta(snapshot);
  renderBadges(snapshot);
  code.show(snapshot);
  store.load(snapshot);
}

function applyFailure(failure: StudioFailure): void {
  status.className = "status error";
  status.innerHTML = `<i></i><span>Compile failed · r${failure.revision}</span>`;
  failureView.textContent = failure.error;
  if (failure.range !== undefined) code.highlight([{ range: failure.range, tone: "element" }], true);
}

const response = await fetch("/__studio/session");
const initial = await response.json() as StudioSnapshot | StudioFailure;
if (response.ok && "tracks" in initial) applySnapshot(initial);
else applyFailure(initial as StudioFailure);

type Hot = { on(event: string, listener: (value: unknown) => void): void };
const hot = (import.meta as ImportMeta & { hot?: Hot }).hot;
hot?.on("studio:snapshot", (value) => applySnapshot(value as StudioSnapshot));
hot?.on("studio:error", (value) => applyFailure(value as StudioFailure));
