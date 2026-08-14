import type { PlaygroundFailure, PlaygroundSnapshot, Range as SourceRange } from "../shared.js";
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

// How much room the Source needs against how much the picture needs depends on
// the Source and on what is being worked on, so both edges are the reader's.
const shell = app.querySelector<HTMLElement>("main")!;
const left = app.querySelector<HTMLElement>(".left")!;
shell.insertBefore(createHandle({
  axis: "column", initial: 520, minimum: 320, invert: true,
  maximum: () => Math.max(360, shell.clientWidth - 420),
  apply: (size) => { shell.style.gridTemplateColumns = `minmax(0,1fr) auto ${size}px`; },
  remember: "svml-playground.code-width",
}), app.querySelector<HTMLElement>(".right")!);
left.insertBefore(createHandle({
  axis: "row", initial: 288, minimum: 140, invert: true,
  maximum: () => Math.max(160, left.clientHeight - 260),
  apply: (size) => { left.style.gridTemplateRows = `minmax(0,1fr) auto auto ${size}px`; },
  remember: "svml-playground.timeline-height",
}), app.querySelector<HTMLElement>("[data-timeline]")!);
const inspector = app.querySelector<HTMLElement>("[data-inspector]")!;
const meta = app.querySelector<HTMLElement>("[data-meta]")!;
const badges = app.querySelector<HTMLElement>("[data-badges]")!;
const status = app.querySelector<HTMLElement>("[data-status]")!;
const failureView = app.querySelector<HTMLElement>("[data-failure]")!;

/**
 * How much of what is shown was invented.
 *
 * One badge over the whole programme said "picture: measured" while two Tracks
 * were showing a stand-in, because a single word cannot describe seven Tracks
 * that differ. Each Track now says its own; this counts them, and clicking it
 * is the same as reading them.
 */
function renderBadges(snapshot: PlaygroundSnapshot): void {
  badges.replaceChildren();
  const standing = snapshot.tracks.filter((track) => track.source !== "made");
  if (standing.length === 0) return;
  const badge = document.createElement("span");
  badge.className = "badge badge-estimated";
  badge.textContent = `${standing.length} of ${snapshot.tracks.length} tracks are standing in`;
  badge.title = snapshot.provenance.note;
  badges.append(badge);
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
    cells.push(
      cell("clip", clip.label, "wide"),
      cell("present", clip.id),
      cell("span", `${clip.startFrame}-${clip.endFrameExclusive}f (${seconds.toFixed(2)}s)`),
      cell("stack", String(clip.stackOrder)),
    );
    if (clip.standIn !== undefined) {
      cells.push(cell("showing", clip.standIn === "picture"
        ? "a picture this shot names - the shot itself has not been made"
        : "a black frame - this shot has no material and names no picture", "warn"));
    }
  }

  for (const item of snapshot.refused) {
    cells.push(cell(`${item.output} not shown`, item.reason, "warn"));
  }

  for (const track of snapshot.tracks) {
    if (track.waiting === undefined) continue;
    cells.push(cell(`${track.label} not shown`, `waiting on ${track.waiting.join(", ")}`, "warn"));
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
