import type { PlaygroundFailure, PlaygroundSnapshot, Range as SourceRange } from "../shared.js";
import { createCodePane } from "./code.js";
import type { Highlight } from "./code.js";
import { liveRanges, markerTones, spanAtOffset } from "./markers.js";
import { clipAtOffset, createStore } from "./selection.js";
import { createStage } from "./stage.js";
import { createTimeline } from "./timeline.js";
import "../style.css";

const app = document.querySelector<HTMLElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <div><strong>SVML Playground</strong></div>
    <div class="meta" data-meta></div>
    <div class="badges" data-badges></div>
    <div class="status" data-status>Reading…</div>
  </header>
  <main>
    <div class="left">
      <div data-stage></div>
      <section class="inspector" data-inspector></section>
      <div data-timeline></div>
    </div>
    <div class="right" data-code></div>
  </main>
  <pre class="failure" data-failure></pre>`;

const store = createStore();
const code = createCodePane();
const timeline = createTimeline(store);
const stage = createStage(store);
app.querySelector<HTMLElement>("[data-code]")!.append(code.element);
app.querySelector<HTMLElement>("[data-timeline]")!.append(timeline.element);
app.querySelector<HTMLElement>("[data-stage]")!.append(stage.element);
const inspector = app.querySelector<HTMLElement>("[data-inspector]")!;
const meta = app.querySelector<HTMLElement>("[data-meta]")!;
const badges = app.querySelector<HTMLElement>("[data-badges]")!;
const status = app.querySelector<HTMLElement>("[data-status]")!;
const failureView = app.querySelector<HTMLElement>("[data-failure]")!;

function renderBadges(snapshot: PlaygroundSnapshot): void {
  badges.replaceChildren();
  for (const [label, value] of [
    ["timing", snapshot.provenance.timing],
    ["picture", snapshot.provenance.picture],
  ] as const) {
    const badge = document.createElement("span");
    badge.className = `badge badge-${value}`;
    badge.textContent = `${label}: ${value}`;
    badge.title = snapshot.provenance.note;
    badges.append(badge);
  }
}

// Program-level facts never change while a Source is being read, so they live in
// the header rather than taking a panel that would have to sit over something.
function renderMeta(snapshot: PlaygroundSnapshot): void {
  const { space } = snapshot;
  meta.textContent = [
    `${space.canvasWidth}x${space.canvasHeight}`,
    `${space.frameRate.numerator}/${space.frameRate.denominator}fps`,
    `${space.frameCount}f (${space.durationSec.toFixed(2)}s)`,
  ].join("   ");
}

function cell(label: string, value: string, tone?: string): HTMLElement {
  const node = document.createElement("div");
  node.className = `cell${tone === undefined ? "" : ` ${tone}`}`;
  node.innerHTML = "<dt></dt><dd></dd>";
  node.querySelector("dt")!.textContent = label;
  node.querySelector("dd")!.textContent = value;
  return node;
}

/** The Script marker a clip is bound to, or its own id when it binds nothing. */
function bindingId(clip: { readonly binding: { readonly kind: string; readonly id?: string }; readonly id: string }): string {
  return clip.binding.id ?? clip.id;
}

function box(value: { widthPx: number; heightPx: number; xPx: number; yPx: number }): string {
  return `${Math.round(value.widthPx)}x${Math.round(value.heightPx)}`
    + ` at ${Math.round(value.xPx)},${Math.round(value.yPx)}`;
}

/**
 * A single strip between the picture and the timeline. It is a row of the
 * layout rather than a floating card, so it can never cover the frame being
 * inspected or the transport used to reach it.
 */
function renderInspector(snapshot: PlaygroundSnapshot, clipId: string | undefined): void {
  const clip = clipId === undefined ? undefined : store.clip(clipId);
  const cells: HTMLElement[] = [];

  if (clip === undefined) {
    cells.push(cell("selected", "nothing - click a marked line or a timeline clip"));
  } else {
    const fps = snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;
    const seconds = (clip.endFrameExclusive - clip.startFrame) / fps;
    const caveats = [
      ...(clip.animated ? ["animates"] : []),
      ...(clip.placeholder ? ["placeholder"] : []),
    ];
    cells.push(
      cell("clip", clip.label, "wide"),
      cell("binding", clip.binding.kind === "program" ? "whole program" : `${clip.binding.kind} ${clip.binding.id}`),
      cell("span", `${clip.startFrame}-${clip.endFrameExclusive}f (${seconds.toFixed(2)}s)`),
      cell("placement", box(clip.frame)),
      cell("content box", box(clip.contentFrame)),
    );
    if (caveats.length > 0) cells.push(cell("note", caveats.join(", ")));
  }

  for (const item of snapshot.refused) {
    cells.push(cell(`${item.output} not shown`, item.reason, "warn"));
  }

  if (snapshot.unsupported.length > 0) {
    const skipped = document.createElement("details");
    skipped.className = "skipped";
    const summary = document.createElement("summary");
    summary.textContent = `${snapshot.unsupported.length} not projected`;
    skipped.append(summary);
    const list = document.createElement("div");
    list.className = "skipped-list";
    for (const item of snapshot.unsupported) {
      const row = document.createElement("button");
      row.type = "button";
      row.textContent = item.tag;
      row.addEventListener("click", () => code.highlight([{ range: item.range, tone: "element" }], true));
      list.append(row);
    }
    skipped.append(list);
    cells.push(skipped);
  }
  inspector.replaceChildren(...cells);
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
  // A clip selected while the playhead sits elsewhere still shows its binding,
  // because the question was "where is this", not "what is on screen".
  if (chosen?.bindingRange !== undefined
    && !highlights.some((item) => item.range.start === chosen.bindingRange!.start)) {
    highlights.push({
      range: chosen.bindingRange,
      tone: "binding",
      depth: tones.get(bindingId(chosen)) ?? 0,
    });
  }
  // The element that placed what is on screen is outlined too. Knowing a cutaway
  // is running is half the answer; the other half is which line put it there.
  const elements = new Map<number, SourceRange>();
  for (const clip of live) elements.set(clip.elementRange.start, clip.elementRange);
  if (chosen !== undefined) elements.set(chosen.elementRange.start, chosen.elementRange);
  for (const range of elements.values()) highlights.push({ range, tone: "element" });

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
  const state = store.current();
  const offset = state === undefined ? undefined : code.offsetAt(event);
  if (state === undefined || offset === undefined) return;
  const clip = clipAtOffset(state.snapshot, offset);

  // A click inside marked prose lands inside the innermost marker written there,
  // not at the start of whatever encloses it. `@amount` places nothing, so
  // resolving through clips alone would throw the playhead out to `@fee`.
  const span = spanAtOffset(state.snapshot, offset);
  const inProse = span !== undefined
    && clip?.elementRange !== undefined
    && !(offset >= clip.elementRange.start && offset <= clip.elementRange.end);
  if (inProse) {
    const bound = state.snapshot.tracks
      .flatMap((track) => track.clips)
      .find((item) => item.binding.kind !== "program" && item.binding.id === span.id);
    // A marker that places nothing still sits inside one that does, so the
    // enclosing clip stays selected rather than leaving the inspector blank.
    store.focus(span.startFrame, bound?.id ?? clip.id, "code");
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

function applySnapshot(snapshot: PlaygroundSnapshot): void {
  failureView.textContent = "";
  status.className = "status ok";
  status.textContent = `Watching ${snapshot.source.path} - revision ${snapshot.revision}`;
  renderMeta(snapshot);
  renderBadges(snapshot);
  code.show(snapshot);
  store.load(snapshot);
}

function applyFailure(failure: PlaygroundFailure): void {
  status.className = "status error";
  status.textContent = `Read failed - revision ${failure.revision}`;
  failureView.textContent = failure.error;
  if (failure.range !== undefined) code.highlight([{ range: failure.range, tone: "element" }], true);
}

const response = await fetch("/__svml/session");
const initial = await response.json() as PlaygroundSnapshot | PlaygroundFailure;
if (response.ok && "tracks" in initial) applySnapshot(initial);
else applyFailure(initial as PlaygroundFailure);

type Hot = { on(event: string, listener: (value: unknown) => void): void };
const hot = (import.meta as ImportMeta & { hot?: Hot }).hot;
hot?.on("svml:snapshot", (value) => applySnapshot(value as PlaygroundSnapshot));
hot?.on("svml:error", (value) => applyFailure(value as PlaygroundFailure));
