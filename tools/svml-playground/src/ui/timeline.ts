import type { PlaygroundSnapshot } from "../shared.js";
import { markerTones } from "./markers.js";
import type { State, Store } from "./selection.js";
import { createZoom } from "./zoom.js";

export type Timeline = { readonly element: HTMLElement };

/** Ruler ticks land on whole seconds until that gets too dense, then on 5s / 10s. */
function tickSeconds(durationSec: number, widthPx: number): number {
  for (const step of [1, 2, 5, 10, 15, 30, 60]) {
    if (durationSec / step <= Math.max(2, widthPx / 64)) return step;
  }
  return 120;
}

function timecode(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * A cutting-room timeline read straight from the Source: the Speech Spine on the
 * bottom track, every Media Item above it on one shared track, exactly as an
 * editor would lay them out.
 */
/** One row of one Track. A Track with overlapping clips is several rows tall. */
const LANE_HEIGHT = 52;

/**
 * Where a frame sits across the strip, once the zoom window is taken into
 * account. Everything the timeline draws goes through here, so the ruler, the
 * clips and the playhead cannot disagree about where a moment is.
 */
function place(frame: number, frameCount: number, shown: { start: number; end: number }): number {
  const span = Math.max(1e-6, shown.end - shown.start);
  return (frame / Math.max(1, frameCount) - shown.start) / span;
}

export function createTimeline(store: Store): Timeline {
  const element = document.createElement("section");
  element.className = "timeline";
  element.innerHTML = `
    <div class="pane-heading">
      <h2>Timeline</h2>
      <span data-readout></span>
    </div>
    <div class="timeline-body">
      <div class="timeline-labels" data-labels></div>
      <div class="timeline-lanes" data-lanes>
        <div class="ruler" data-ruler></div>
        <div class="lanes" data-rows></div>
        <div class="playhead" data-playhead><div class="playhead-grip"></div></div>
      </div>
    </div>
    <div class="timeline-zoom" data-zoom></div>`;

  const readout = element.querySelector<HTMLElement>("[data-readout]")!;
  const labels = element.querySelector<HTMLElement>("[data-labels]")!;
  const lanes = element.querySelector<HTMLElement>("[data-lanes]")!;
  // The whole programme as a bar, with the shown part as a window inside it.
  const zoom = createZoom();
  element.querySelector<HTMLElement>("[data-zoom]")!.append(zoom.element);
  // Positions are computed against the window rather than scaled, so a clip's
  // label stays the size it was however far in the reader has zoomed.
  const ruler = element.querySelector<HTMLElement>("[data-ruler]")!;
  const rows = element.querySelector<HTMLElement>("[data-rows]")!;
  const playhead = element.querySelector<HTMLElement>("[data-playhead]")!;

  let state: State | undefined;
  let built = -1;

  const fps = (snapshot: PlaygroundSnapshot): number =>
    snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;

  const frameAt = (clientX: number): number => {
    const box = lanes.getBoundingClientRect();
    if (box.width === 0 || state === undefined) return 0;
    const ratio = (clientX - box.left) / box.width;
    return Math.floor(ratio * state.snapshot.space.frameCount);
  };

  const scrub = (event: PointerEvent): void => {
    // Capture keeps a drag alive past the edge of the lanes, but it is not
    // essential: never let it stop the seek that the author actually asked for.
    try { lanes.setPointerCapture(event.pointerId); } catch { /* drag stays local */ }
    store.seek(frameAt(event.clientX), "timeline");
  };

  lanes.addEventListener("pointerdown", (event) => {
    // A click on a clip selects it; a click on open track or the ruler moves the
    // playhead and lets go of whatever was selected, because open track is the
    // one place that plainly means "not that one".
    if ((event.target as HTMLElement).closest(".clip") !== null) return;
    store.clearSelection();
    scrub(event);
  });
  lanes.addEventListener("pointermove", (event) => {
    if (event.buttons === 1 && lanes.hasPointerCapture(event.pointerId)) {
      store.seek(frameAt(event.clientX), "timeline");
    }
  });

  const drawRuler = (snapshot: PlaygroundSnapshot): void => {
    ruler.replaceChildren();
    const width = lanes.clientWidth;
    const step = tickSeconds(snapshot.space.durationSec, width);
    for (let seconds = 0; seconds <= snapshot.space.durationSec; seconds += step) {
      const tick = document.createElement("span");
      tick.className = "tick";
      const frame = seconds * snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;
      const at = place(frame, snapshot.space.frameCount, zoom.window());
      tick.style.left = `${at * 100}%`;
      // A label near the end would hang past the strip and give the panel a
      // width nothing occupies, so the last one reads back from its own mark.
      if (at > 0.94) tick.classList.add("tick-last");
      tick.textContent = timecode(seconds);
      ruler.append(tick);
    }
  };

  const build = (snapshot: PlaygroundSnapshot): void => {
    labels.replaceChildren();
    rows.replaceChildren();
    const tones = markerTones(snapshot);

    const corner = document.createElement("div");
    corner.className = "label-corner";
    corner.textContent = `${snapshot.space.frameCount}f`;
    labels.append(corner);

    for (const track of snapshot.tracks) {
      const label = document.createElement("div");
      label.className = track.waiting === undefined ? "track-label" : "track-label track-waiting";
      label.innerHTML = "<strong></strong><small></small>";
      label.querySelector("strong")!.textContent = track.label;
      // What this Track is showing. Real material at measured times needs no
      // remark; anything else is a footnote the reader can open, because the
      // full sentence would not fit beside the strip.
      const said = {
        made: "Material this Source names.",
        "stand-in": "This shot has not been made. It shows a picture the Source names for it.",
        black: "This shot has no material and names no picture, so it shows a black frame.",
        waiting: `Not built here: waiting on ${(track.waiting ?? []).join(", ")}.`,
      }[track.source];
      const timing = track.timing === "measured"
        ? "Times were supplied."
        : "No times were supplied, so words are placed at an ordinary delivery pace.";
      const plain = track.source === "made" && track.timing === "measured";
      label.querySelector("small")!.textContent =
        `${track.clips.length} clip${track.clips.length === 1 ? "" : "s"}`;
      if (!plain) {
        const note = document.createElement("button");
        note.type = "button";
        note.className = `track-note note-${track.source}`;
        note.append("i");
        note.title = `${said} ${timing}`;
        note.setAttribute("aria-label", note.title);
        const bubble = document.createElement("span");
        bubble.className = "note-bubble";
        bubble.textContent = `${said} ${timing}`;
        note.append(bubble);
        // Fixed to the viewport so the panel it hangs out of cannot clip it,
        // which means it has to be told where the note is each time.
        note.addEventListener("pointerenter", () => {
          const box = note.getBoundingClientRect();
          bubble.style.left = `${box.right + 8}px`;
          bubble.style.top = `${Math.max(8, box.top + box.height / 2 - 30)}px`;
        });
        label.querySelector("small")!.append(note);
      }
      labels.append(label);

      // Clips that overlap in time cannot share a row without hiding each
      // other, so a Track is as many rows tall as it needs. A board's panel
      // runs the whole programme and its rows settle underneath it.
      const freeFrom: number[] = [];
      const rowOf = new Map<string, number>();
      for (const clip of [...track.clips].sort((a, b) => a.startFrame - b.startFrame)) {
        let row = freeFrom.findIndex((free) => free <= clip.startFrame);
        if (row < 0) { row = freeFrom.length; freeFrom.push(0); }
        freeFrom[row] = clip.endFrameExclusive;
        rowOf.set(clip.id, row);
      }
      const depth = Math.max(1, freeFrom.length);
      label.style.height = `${depth * LANE_HEIGHT}px`;

      const lane = document.createElement("div");
      lane.className = "lane";
      lane.style.height = `${depth * LANE_HEIGHT}px`;
      for (const clip of track.clips) {
        const node = document.createElement("button");
        node.type = "button";
        node.className = "clip";
        node.dataset.clip = clip.id;
        const from = place(clip.startFrame, snapshot.space.frameCount, zoom.window());
        const to = place(clip.endFrameExclusive, snapshot.space.frameCount, zoom.window());
        node.style.left = `${from * 100}%`;
        node.style.top = `${(rowOf.get(clip.id) ?? 0) * LANE_HEIGHT}px`;
        node.style.width = `${(to - from) * 100}%`;
        node.title = `${clip.label} (${clip.startFrame}-${clip.endFrameExclusive}f)`;
        node.innerHTML = `<span class="clip-name"></span><span class="clip-meta"></span>`;
        node.querySelector(".clip-name")!.textContent = clip.label;
        node.querySelector(".clip-meta")!.textContent =
          `${((clip.endFrameExclusive - clip.startFrame) / fps(snapshot)).toFixed(2)}s`;
        if (clip.standIn !== undefined) node.classList.add(`clip-stand-in-${clip.standIn}`);
        // Same tone as the Script marker this clip is named after.
        const tone = tones.get(clip.authoredId);
        if (tone !== undefined) node.classList.add(`tone-${tone}`);
        node.addEventListener("click", () => store.selectClip(clip.id, "timeline"));
        lane.append(node);
      }
      rows.append(lane);
    }
    drawRuler(snapshot);
  };

  const paint = (): void => {
    if (state === undefined) return;
    const { snapshot, selection, playhead: head } = state;
    const percent = place(head.frame, snapshot.space.frameCount, zoom.window()) * 100;
    playhead.style.left = `${percent}%`;
    readout.textContent =
      `${head.frame} / ${snapshot.space.frameCount - 1}f (${(head.frame / fps(snapshot)).toFixed(2)}s)`;
    for (const node of Array.from(rows.querySelectorAll<HTMLElement>(".clip"))) {
      const id = node.dataset.clip!;
      node.classList.toggle("selected", selection.kind === "clip" && selection.clipId === id);
      const clip = store.clip(id);
      node.classList.toggle(
        "live",
        clip !== undefined && head.frame >= clip.startFrame && head.frame < clip.endFrameExclusive,
      );
    }
  };

  // A trackpad pinch is a wheel event with ctrlKey set; two fingers sideways is
  // a wheel with deltaX. Both are how a reader expects to move around a strip.
  lanes.addEventListener("wheel", (event) => {
    if (event.ctrlKey) {
      event.preventDefault();
      const box = lanes.getBoundingClientRect();
      const at = box.width === 0 ? 0.5 : (event.clientX - box.left) / box.width;
      zoom.pinch(at, Math.exp(event.deltaY * 0.01));
      return;
    }
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    zoom.slide(event.deltaX / Math.max(1, lanes.clientWidth));
  }, { passive: false });

  // Subscribed here rather than where the zoom is made: it reports its window
  // at once, and there is nothing to redraw until a Source has been read.
  zoom.subscribe(() => {
    if (state === undefined) return;
    build(state.snapshot);
    paint();
  });

  store.subscribe((value) => {
    state = value;
    if (value.snapshot.revision !== built) {
      built = value.snapshot.revision;
      build(value.snapshot);
    }
    paint();
  });

  new ResizeObserver(() => {
    if (state !== undefined) drawRuler(state.snapshot);
  }).observe(lanes);

  return { element };
}
