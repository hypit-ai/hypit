import type { PlaygroundSnapshot } from "../shared.js";
import { markerTones } from "./markers.js";
import type { State, Store } from "./selection.js";

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
    </div>`;

  const readout = element.querySelector<HTMLElement>("[data-readout]")!;
  const labels = element.querySelector<HTMLElement>("[data-labels]")!;
  const lanes = element.querySelector<HTMLElement>("[data-lanes]")!;
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
    // A click on a clip selects it; a click on open track or the ruler scrubs.
    if ((event.target as HTMLElement).closest(".clip") === null) scrub(event);
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
      tick.style.left = `${seconds / snapshot.space.durationSec * 100}%`;
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
      label.className = `track-label track-${track.kind}`;
      label.innerHTML = "<strong></strong><small></small>";
      label.querySelector("strong")!.textContent = track.label;
      label.querySelector("small")!.textContent = `${track.clips.length} clip${track.clips.length === 1 ? "" : "s"}`;
      labels.append(label);

      const lane = document.createElement("div");
      lane.className = `lane lane-${track.kind}`;
      for (const clip of track.clips) {
        const node = document.createElement("button");
        node.type = "button";
        node.className = `clip clip-${track.kind}`;
        node.dataset.clip = clip.id;
        node.style.left = `${clip.startFrame / snapshot.space.frameCount * 100}%`;
        node.style.width = `${(clip.endFrameExclusive - clip.startFrame) / snapshot.space.frameCount * 100}%`;
        node.title = `${clip.label} (${clip.startFrame}-${clip.endFrameExclusive}f)`;
        node.innerHTML = `<span class="clip-name"></span><span class="clip-meta"></span>`;
        node.querySelector(".clip-name")!.textContent = clip.label;
        node.querySelector(".clip-meta")!.textContent =
          `${((clip.endFrameExclusive - clip.startFrame) / fps(snapshot)).toFixed(2)}s`;
        if (clip.placeholder) node.classList.add("clip-placeholder");
        // Same tone as the Script marker this clip is bound to.
        const tone = clip.binding.kind === "program" ? undefined : tones.get(clip.binding.id);
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
    const percent = head.frame / snapshot.space.frameCount * 100;
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
