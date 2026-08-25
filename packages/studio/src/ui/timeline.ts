import type {
  SemanticToken,
  StudioSnapshot,
} from "../shared.js";
import type { StudioEditHandle } from "@hypit/studio-adapter";
import { icon, setIcon } from "./icons.js";
import { mountMaterialPreview } from "./material-preview.js";
import type { State, Store } from "./selection.js";
import { createHandle } from "./resize.js";
import { createZoom } from "./zoom.js";
import { applyStudioMutation } from "./writeback.js";

export type Timeline = {
  readonly element: HTMLElement;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly fit: () => void;
};

const opened = new Set<string>();
const itemMetrics = {
  // Ordinary items fill their rows. Only the semantic lane owns compact word cells.
  insetYPx: 1,
  headerPx: 15,
  contentCellPx: 18,
  gapPx: 1,
} as const;

const labelFont = '500 11px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
const textMeasure = document.createElement("canvas").getContext("2d");
const textWidths = new Map<string, number>();
const wordLabelPaddingPx = 5;
const wordLabelEnterBufferPx = 1;

function measuredText(value: string, font = labelFont): number {
  const key = `${font}\u0000${value}`;
  const cached = textWidths.get(key);
  if (cached !== undefined) return cached;
  if (textMeasure === null) return Array.from(value).length * 7;
  textMeasure.font = font;
  const width = textMeasure.measureText(value).width;
  textWidths.set(key, width);
  return width;
}

function timecode(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function frameTickLabel(frame: number): string {
  return `${frame}f`;
}

function frameSteps(frameRate: number): readonly number[] {
  const result: number[] = [];
  for (let candidate = 1; candidate <= frameRate; candidate += 1) {
    if (frameRate % candidate === 0) result.push(candidate);
  }
  return result;
}

function place(frame: number, frameCount: number, shown: { start: number; end: number }): number {
  const span = Math.max(1e-6, shown.end - shown.start);
  return (frame / Math.max(1, frameCount) - shown.start) / span;
}

function displayTrackName(track: StudioSnapshot["tracks"][number]): string {
  if (track.binding.label !== undefined) return track.binding.label;
  return track.label;
}

function visibleItemWidth(
  from: number,
  to: number,
  laneWidth: number,
): number {
  const visibleFrom = Math.max(0, from);
  const visibleTo = Math.min(1, to);
  return Math.max(0, visibleTo - visibleFrom) * laneWidth;
}

export function createTimeline(store: Store): Timeline {
  const element = document.createElement("section");
  element.className = "timeline";
  element.style.setProperty("--timeline-item-inset-y", `${itemMetrics.insetYPx}px`);
  element.style.setProperty("--timeline-item-header-height", `${itemMetrics.headerPx}px`);
  element.style.setProperty("--timeline-content-cell-height", `${itemMetrics.contentCellPx}px`);
  element.innerHTML = `
    <div class="timeline-toolbar">
      <div class="timeline-tools">
        <button type="button" class="tool-button active" aria-label="Select" title="Select">${icon("select")}</button>
      </div>
      <div class="timeline-time" data-timeline-time>00:00:00</div>
      <div class="timeline-view-actions">
        <button type="button" class="icon-button" data-zoom-out aria-label="Zoom out" title="Zoom out">${icon("minus")}</button>
        <button type="button" class="icon-button" data-zoom-fit aria-label="Fit timeline" title="Fit timeline">${icon("fit")}</button>
        <button type="button" class="icon-button" data-zoom-in aria-label="Zoom in" title="Zoom in">${icon("plus")}</button>
      </div>
    </div>
    <div class="timeline-body" data-timeline-body>
      <div class="timeline-labels" data-labels></div>
      <div class="timeline-lanes" data-lanes>
        <div class="ruler" data-ruler><div class="playhead-grip" data-playhead-grip></div></div>
        <div class="lanes" data-rows></div>
        <div class="timeline-hover" data-hover aria-hidden="true"><span data-hover-time></span></div>
        <div class="playhead" data-playhead></div>
      </div>
    </div>
    <div class="timeline-zoom" data-zoom></div>`;

  const labels = element.querySelector<HTMLElement>("[data-labels]")!;
  const body = element.querySelector<HTMLElement>("[data-timeline-body]")!;
  const lanes = element.querySelector<HTMLElement>("[data-lanes]")!;
  const ruler = element.querySelector<HTMLElement>("[data-ruler]")!;
  const rows = element.querySelector<HTMLElement>("[data-rows]")!;
  const hover = element.querySelector<HTMLElement>("[data-hover]")!;
  const hoverTime = element.querySelector<HTMLElement>("[data-hover-time]")!;
  const playhead = element.querySelector<HTMLElement>("[data-playhead]")!;
  const playheadGrip = element.querySelector<HTMLElement>("[data-playhead-grip]")!;
  const timelineTime = element.querySelector<HTMLElement>("[data-timeline-time]")!;
  const zoom = createZoom();
  element.querySelector<HTMLElement>("[data-zoom]")!.append(zoom.element);

  // The label column is part of the timeline's reading surface, not a fixed
  // application chrome width.  Keep enough room for the longest built-in
  // facet name while leaving a usable canvas, and remember the author's choice.
  const labelHandle = createHandle({
    axis: "column",
    initial: 188,
    minimum: 156,
    // createTimeline is constructed before it is attached to the document, so
    // clientWidth is initially zero. Keep the preferred default valid during
    // that first pass; on a real viewport the canvas-aware ceiling applies,
    // with 260px as the hard visual cap on a wide timeline.
    maximum: () => Math.min(260, Math.max(188, body.clientWidth - 360)),
    apply: (size) => { element.style.setProperty("--timeline-label-width", `${size}px`); },
    remember: "hypit-studio.v4.timeline-label-width",
  });
  labelHandle.classList.add("timeline-label-handle");
  labelHandle.setAttribute("aria-label", "Resize timeline track labels");
  labelHandle.title = "Resize track labels";
  body.insertBefore(labelHandle, lanes);

  let state: State | undefined;
  let built = -1;
  let paintFrame = 0;
  let rebuildFrame = 0;
  const readableWordLabels = new Set<string>();
  let clipNodes: readonly {
    readonly node: HTMLElement;
    readonly start: number;
    readonly end: number;
    readonly id: string;
  }[] = [];
  let semanticNodes: readonly {
    readonly node: HTMLElement;
    readonly id: string;
    readonly start: number;
    readonly end: number;
    readonly kind: "segment" | "word" | "selection" | "moment";
  }[] = [];

  const playheadFraction = (): number => {
    if (state === undefined) return 0.5;
    const shown = zoom.window();
    const at = state.playhead.frame / Math.max(1, state.snapshot.space.frameCount);
    return Math.max(0, Math.min(1, (at - shown.start) / Math.max(1e-6, shown.end - shown.start)));
  };
  const zoomOut = (): void => zoom.pinch(playheadFraction(), 1.25);
  const zoomIn = (): void => zoom.pinch(playheadFraction(), 0.8);
  const fit = (): void => zoom.fit();
  element.querySelector<HTMLButtonElement>("[data-zoom-out]")!.addEventListener("click", zoomOut);
  element.querySelector<HTMLButtonElement>("[data-zoom-in]")!.addEventListener("click", zoomIn);
  element.querySelector<HTMLButtonElement>("[data-zoom-fit]")!.addEventListener("click", fit);

  const fps = (snapshot: StudioSnapshot): number =>
    snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;

  const snapFrame = (frame: number): number => {
    if (state === undefined || lanes.clientWidth <= 0) return frame;
    const shown = zoom.window();
    const threshold = Math.max(1, Math.ceil(
      (shown.end - shown.start) * state.snapshot.space.frameCount / lanes.clientWidth * 6,
    ));
    let nearest = frame;
    let distance = threshold + 1;
    const consider = (candidate: number): void => {
      const next = Math.abs(candidate - frame);
      if (next < distance) { nearest = candidate; distance = next; }
    };
    for (const anchor of state.snapshot.semantic.anchors) consider(anchor.frame);
    for (const clip of state.snapshot.tracks.flatMap((track) => track.clips)) {
      consider(clip.startFrame);
      consider(clip.endFrameExclusive);
    }
    return distance <= threshold ? nearest : frame;
  };

  const rawFrameAt = (clientX: number): number => {
    const box = lanes.getBoundingClientRect();
    if (box.width === 0 || state === undefined) return 0;
    const across = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    const shown = zoom.window();
    return Math.floor(
      (shown.start + across * (shown.end - shown.start)) * state.snapshot.space.frameCount,
    );
  };
  const frameAt = (clientX: number): number => snapFrame(rawFrameAt(clientX));

  const frameTimecode = (snapshot: StudioSnapshot, frame: number): string => {
    const rate = Math.max(1, Math.round(fps(snapshot)));
    const seconds = Math.floor(frame / fps(snapshot));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}:${String(frame % rate).padStart(2, "0")}`;
  };

  let pointerArmed = false;
  let pointerDownX = 0;
  let pointerDownOnItem = false;
  let activeEdit: {
    readonly clip: StudioSnapshot["tracks"][number]["clips"][number];
    readonly handle: StudioEditHandle;
    readonly startFrame: number;
    readonly pointerAnchorIndex?: number;
    readonly pointerId: number;
    readonly node: HTMLElement;
    readonly originalLeft: string;
    readonly originalWidth: string;
  } | undefined;

  const nearestAnchorIndex = (
    frame: number,
    indices: readonly number[],
    preferredIndex?: number,
  ): number | undefined => {
    if (state === undefined) return undefined;
    const anchors = state.snapshot.semantic.anchors;
    const preferredKind = preferredIndex === undefined ? undefined : anchors[preferredIndex]?.kind;
    return [...indices].sort((left, right) => {
      const leftAnchor = anchors[left]!;
      const rightAnchor = anchors[right]!;
      return Math.abs(leftAnchor.frame - frame) - Math.abs(rightAnchor.frame - frame)
        || Number(leftAnchor.kind !== preferredKind) - Number(rightAnchor.kind !== preferredKind)
        || Math.abs(left - (preferredIndex ?? left)) - Math.abs(right - (preferredIndex ?? right))
        || left - right;
    })[0];
  };

  const semanticTarget = (
    edit: NonNullable<typeof activeEdit>,
    nextFrame: number,
  ): { readonly kind: "selection"; readonly startAnchorId: string; readonly endAnchorId: string }
    | { readonly kind: "moment"; readonly anchorId: string }
    | undefined => {
    if (state === undefined || edit.handle.semantic === undefined) return undefined;
    const semantic = edit.handle.semantic;
    const anchors = state.snapshot.semantic.anchors;
    if (semantic.kind === "moment") {
      const currentIndex = anchors.findIndex((anchor) => anchor.id === semantic.anchorId);
      const anchorIndex = nearestAnchorIndex(
        nextFrame,
        anchors.map((_, index) => index),
        currentIndex < 0 ? undefined : currentIndex,
      );
      return anchorIndex === undefined ? undefined : { kind: "moment", anchorId: anchors[anchorIndex]!.id };
    }
    const startIndex = anchors.findIndex((anchor) => anchor.id === semantic.startAnchorId);
    const endIndex = anchors.findIndex((anchor) => anchor.id === semantic.endAnchorId);
    if (startIndex < 0 || endIndex < 0 || startIndex >= endIndex) return undefined;
    let nextStart = startIndex;
    let nextEnd = endIndex;
    if (edit.handle.gesture === "trim-start") {
      const allowed = anchors.flatMap((anchor, index) =>
        index < endIndex && anchor.frame < anchors[endIndex]!.frame ? [index] : []);
      nextStart = nearestAnchorIndex(nextFrame, allowed, startIndex) ?? startIndex;
    } else if (edit.handle.gesture === "trim-end") {
      const allowed = anchors.flatMap((anchor, index) =>
        index > startIndex && anchor.frame > anchors[startIndex]!.frame ? [index] : []);
      nextEnd = nearestAnchorIndex(nextFrame, allowed, endIndex) ?? endIndex;
    } else if (edit.handle.gesture === "move") {
      const instantBoundary = edit.handle.temporal?.kind === "instant"
        && edit.handle.temporal.authority.kind === "semantic"
        && edit.handle.temporal.authority.source.kind === "selection"
        ? edit.handle.temporal.authority.boundary
        : undefined;
      if (instantBoundary === "start") {
        const allowed = anchors.flatMap((anchor, index) =>
          index < endIndex && anchor.frame < anchors[endIndex]!.frame ? [index] : []);
        nextStart = nearestAnchorIndex(nextFrame, allowed, startIndex) ?? startIndex;
        return { kind: "selection", startAnchorId: anchors[nextStart]!.id, endAnchorId: anchors[nextEnd]!.id };
      }
      if (instantBoundary === "end") {
        const allowed = anchors.flatMap((anchor, index) =>
          index > startIndex && anchor.frame > anchors[startIndex]!.frame ? [index] : []);
        nextEnd = nearestAnchorIndex(nextFrame, allowed, endIndex) ?? endIndex;
        return { kind: "selection", startAnchorId: anchors[nextStart]!.id, endAnchorId: anchors[nextEnd]!.id };
      }
      const pointerIndex = edit.pointerAnchorIndex ?? startIndex;
      const deltas = anchors.flatMap((_, index) => {
        const delta = index - pointerIndex;
        const movedStart = startIndex + delta;
        const movedEnd = endIndex + delta;
        return movedStart >= 0 && movedEnd < anchors.length
          && anchors[movedStart]!.frame < anchors[movedEnd]!.frame
          ? [delta]
          : [];
      });
      const targetPointer = nearestAnchorIndex(
        nextFrame,
        deltas.map((delta) => pointerIndex + delta),
        pointerIndex,
      );
      const delta = targetPointer === undefined ? 0 : targetPointer - pointerIndex;
      nextStart += delta;
      nextEnd += delta;
    } else {
      return undefined;
    }
    return {
      kind: "selection",
      startAnchorId: anchors[nextStart]!.id,
      endAnchorId: anchors[nextEnd]!.id,
    };
  };

  const absoluteWindowTarget = (
    edit: NonNullable<typeof activeEdit>,
    nextFrame: number,
  ): { readonly startFrame: number; readonly endFrameExclusive: number } => {
    if (state === undefined) return {
      startFrame: edit.clip.startFrame,
      endFrameExclusive: edit.clip.endFrameExclusive,
    };
    const rawDelta = nextFrame - edit.startFrame;
    const delta = Math.max(-edit.clip.startFrame,
      Math.min(state.snapshot.space.frameCount - edit.clip.endFrameExclusive, rawDelta));
    if (edit.handle.gesture === "move") return {
      startFrame: edit.clip.startFrame + delta,
      endFrameExclusive: edit.clip.endFrameExclusive + delta,
    };
    if (edit.handle.gesture === "trim-start") return {
      startFrame: Math.min(edit.clip.endFrameExclusive - 1, nextFrame),
      endFrameExclusive: edit.clip.endFrameExclusive,
    };
    return {
      startFrame: edit.clip.startFrame,
      endFrameExclusive: Math.max(edit.clip.startFrame + 1, nextFrame),
    };
  };

  const previewWindow = (
    edit: NonNullable<typeof activeEdit>,
    nextFrame: number,
  ): { readonly startFrame: number; readonly endFrameExclusive: number } | undefined => {
    if (state === undefined) return undefined;
    const target = semanticTarget(edit, nextFrame);
    if (target?.kind === "selection" && edit.handle.semantic?.kind === "selection") {
      const current = state.snapshot.semantic.selections.find((selection) => selection.id === edit.handle.semantic!.id);
      const nextStart = state.snapshot.semantic.anchors.find((anchor) => anchor.id === target.startAnchorId)?.frame;
      const nextEnd = state.snapshot.semantic.anchors.find((anchor) => anchor.id === target.endAnchorId)?.frame;
      if (current === undefined || nextStart === undefined || nextEnd === undefined) return undefined;
      const instantBoundary = edit.handle.temporal?.kind === "instant"
        && edit.handle.temporal.authority.kind === "semantic"
        && edit.handle.temporal.authority.source.kind === "selection"
        ? edit.handle.temporal.authority.boundary
        : undefined;
      if (instantBoundary === "start" || instantBoundary === "end") {
        const frame = instantBoundary === "start" ? nextStart : nextEnd;
        return { startFrame: frame, endFrameExclusive: frame + 1 };
      }
      return {
        startFrame: nextStart + edit.clip.startFrame - current.startFrame,
        endFrameExclusive: nextEnd + edit.clip.endFrameExclusive - current.endFrameExclusive,
      };
    }
    if (target?.kind === "moment" && edit.handle.semantic?.kind === "moment") {
      const current = state.snapshot.semantic.moments.find((moment) => moment.id === edit.handle.semantic!.id);
      const next = state.snapshot.semantic.anchors.find((anchor) => anchor.id === target.anchorId)?.frame;
      if (current === undefined || next === undefined) return undefined;
      const delta = next - current.frame;
      if (edit.handle.gesture === "trim-start") {
        return { startFrame: next, endFrameExclusive: edit.clip.endFrameExclusive };
      }
      if (edit.handle.gesture === "trim-end") {
        return { startFrame: edit.clip.startFrame, endFrameExclusive: next };
      }
      return edit.handle.moveEffect === "move-start"
        ? { startFrame: edit.clip.startFrame + delta, endFrameExclusive: edit.clip.endFrameExclusive }
        : { startFrame: edit.clip.startFrame + delta, endFrameExclusive: edit.clip.endFrameExclusive + delta };
    }
    return edit.handle.temporal === undefined ? undefined : absoluteWindowTarget(edit, nextFrame);
  };
  lanes.addEventListener("pointerdown", (event) => {
    pointerDownOnItem = (event.target as HTMLElement).closest(
      ".clip, .semantic-segment, .semantic-word, .semantic-selection, .semantic-moment",
    ) !== null;
    pointerDownX = event.clientX;
    pointerArmed = true;
    // Let semantic children receive their native click. Capturing every
    // pointer here retargets the later click to `.lanes`, which made segment
    // and selection buttons appear to be dead zones. Blank-space scrubbing
    // still uses capture so it can continue outside the lane.
    if (!pointerDownOnItem) {
      try { lanes.setPointerCapture(event.pointerId); } catch { /* pointer remains local */ }
    }
    if (!pointerDownOnItem) {
      store.clearSelection();
      store.seek(frameAt(event.clientX), "timeline");
    }
  });
  lanes.addEventListener("pointermove", (event) => {
    const frame = frameAt(event.clientX);
    const at = place(frame, state?.snapshot.space.frameCount ?? 1, zoom.window()) * lanes.clientWidth;
    hover.style.transform = `translate3d(${at}px,0,0)`;
    hoverTime.textContent = state === undefined ? "" : frameTimecode(state.snapshot, frame);
    hover.classList.add("visible");
    if (activeEdit !== undefined && state !== undefined) {
      const nextFrame = activeEdit.handle.coordinate === "semantic-anchor"
        ? rawFrameAt(event.clientX)
        : frameAt(event.clientX);
      const preview = previewWindow(activeEdit, nextFrame);
      if (preview !== undefined) {
        const from = place(preview.startFrame, state.snapshot.space.frameCount, zoom.window());
        const to = place(preview.endFrameExclusive, state.snapshot.space.frameCount, zoom.window());
        activeEdit.node.style.left = `${from * 100}%`;
        activeEdit.node.style.width = `max(2px, calc(${Math.max(0, to - from) * 100}% - ${itemMetrics.gapPx}px))`;
      }
      return;
    }
    if (!pointerArmed || event.buttons !== 1) return;
    if (pointerDownOnItem && Math.abs(event.clientX - pointerDownX) < 3) return;
    store.seek(frame, "timeline");
  });
  const finishPointer = (event: PointerEvent): void => {
    const edit = activeEdit;
    activeEdit = undefined;
    edit?.node.classList.remove("editing");
    if (edit !== undefined) {
      edit.node.style.left = edit.originalLeft;
      edit.node.style.width = edit.originalWidth;
    }
    pointerArmed = false;
    try { lanes.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    if (edit === undefined || state === undefined || event.type === "pointercancel") return;
    const nextFrame = edit.handle.coordinate === "semantic-anchor"
      ? rawFrameAt(event.clientX)
      : frameAt(event.clientX);
    const resolvedSemanticTarget = semanticTarget(edit, nextFrame);
    const resolvedWindow = previewWindow(edit, nextFrame);
    if (resolvedWindow === undefined || edit.handle.temporal === undefined) return;
    const target = edit.handle.temporal.kind === "instant"
      ? {
          kind: "instant" as const,
          frame: resolvedWindow.startFrame,
          ...(resolvedSemanticTarget === undefined ? {} : { semantic: resolvedSemanticTarget }),
        }
      : {
          kind: "window" as const,
          ...resolvedWindow,
          ...(resolvedSemanticTarget === undefined ? {} : { semantic: resolvedSemanticTarget }),
        };
    if (resolvedSemanticTarget?.kind === "selection"
      && edit.handle.semantic?.kind === "selection"
      && resolvedSemanticTarget.startAnchorId === edit.handle.semantic.startAnchorId
      && resolvedSemanticTarget.endAnchorId === edit.handle.semantic.endAnchorId
      && (target.kind === "instant"
        ? target.frame === edit.clip.startFrame
        : target.startFrame === edit.clip.startFrame && target.endFrameExclusive === edit.clip.endFrameExclusive)) return;
    if (resolvedSemanticTarget?.kind === "moment"
      && edit.handle.semantic?.kind === "moment"
      && resolvedSemanticTarget.anchorId === edit.handle.semantic.anchorId
      && (target.kind === "instant"
        ? target.frame === edit.clip.startFrame
        : target.startFrame === edit.clip.startFrame && target.endFrameExclusive === edit.clip.endFrameExclusive)) return;
    if (resolvedSemanticTarget === undefined
      && (target.kind === "instant"
        ? target.frame === edit.clip.startFrame
        : target.startFrame === edit.clip.startFrame && target.endFrameExclusive === edit.clip.endFrameExclusive)) return;
    element.dispatchEvent(new CustomEvent("studio:write", { detail: { state: "saving" } }));
    void applyStudioMutation({
      type: "timeline.adjust",
      revision: state.snapshot.revision,
      entityId: edit.clip.id,
      gesture: edit.handle.gesture,
      target,
    }).then(() => {
      element.dispatchEvent(new CustomEvent("studio:write", { detail: { state: "saved" } }));
    }).catch((error: unknown) => {
      // The next snapshot/error event is the source of truth; a failed gesture
      // must never be represented by a local optimistic rectangle.
      console.error(error);
      element.dispatchEvent(new CustomEvent("studio:write", { detail: { state: "error" } }));
    });
  };
  lanes.addEventListener("pointerup", finishPointer);
  lanes.addEventListener("pointercancel", finishPointer);
  lanes.addEventListener("pointerleave", () => {
    if (!pointerArmed) hover.classList.remove("visible");
  });

  const drawRuler = (snapshot: StudioSnapshot): void => {
    ruler.replaceChildren();
    const frameCount = Math.max(1, snapshot.space.frameCount);
    const shown = zoom.window();
    const visibleFrames = Math.max(1, (shown.end - shown.start) * frameCount);
    const widthPx = Math.max(1, lanes.clientWidth);
    const exactRate = Math.max(1, fps(snapshot));
    const rate = Math.max(1, Math.round(exactRate));
    const pxPerFrame = widthPx / visibleFrames;
    const pxPerSecond = pxPerFrame * exactRate;
    const startFrame = shown.start * frameCount;
    const endFrame = shown.end * frameCount;
    const startSecond = startFrame / exactRate;
    const endSecond = endFrame / exactRate;

    const context = document.createElement("span");
    context.className = "ruler-context";
    context.textContent = timecode(startSecond);
    ruler.append(context);

    const secondCandidates = [1, 2, 5, 10, 15, 30, 60, 120];
    const majorSeconds = secondCandidates.find((candidate) => candidate * pxPerSecond >= 112)
      ?? secondCandidates.at(-1)!;
    const firstSecond = Math.max(0, Math.ceil(startSecond - 1e-6));
    const lastSecond = Math.min(Math.floor(snapshot.space.durationSec), Math.floor(endSecond + 1e-6));
    for (let seconds = firstSecond; seconds <= lastSecond; seconds += 1) {
      const frame = Math.min(frameCount, Math.round(seconds * exactRate));
      const at = place(frame, frameCount, shown);
      if (at < 0 || at > 1) continue;
      const major = Math.abs(seconds / majorSeconds - Math.round(seconds / majorSeconds)) < 1e-6;
      const tick = document.createElement("span");
      tick.className = `tick tick-second ${major ? "tick-major" : "tick-minor"}${at > 0.94 ? " tick-last" : ""}`;
      tick.style.left = `${at * 100}%`;
      tick.textContent = major && at * widthPx >= 52 ? timecode(seconds) : "";
      ruler.append(tick);
    }

    const steps = frameSteps(rate);
    // A full-project ruler stays quiet. Once a second occupies enough screen
    // space, minor frame marks enter before their labels. Both densities are
    // selected from the same frame lattice, only with different pixel budgets.
    const tickStep = pxPerSecond < 120
      ? rate
      : steps.find((candidate) => candidate * pxPerFrame >= 18) ?? rate;
    const labelStep = steps.find((candidate) => candidate * pxPerFrame >= 68) ?? rate;
    const firstFrame = Math.max(0, Math.ceil(startFrame));
    const lastFrame = Math.min(frameCount, Math.floor(endFrame));
    for (let frame = firstFrame; frame <= lastFrame; frame += 1) {
      const withinSecond = ((frame % rate) + rate) % rate;
      if (withinSecond === 0) continue;
      const at = place(frame, frameCount, shown);
      if (at < 0 || at > 1) continue;
      if (withinSecond % tickStep === 0) {
        const tick = document.createElement("span");
        tick.className = `tick tick-subdivision${tickStep === 1 ? " tick-frame" : ""}`;
        tick.style.left = `${at * 100}%`;
        ruler.append(tick);
      }
      if (labelStep < rate && withinSecond % labelStep === 0 && at * widthPx >= 52) {
        const label = document.createElement("span");
        label.className = "tick-frame-label";
        label.style.left = `${at * 100}%`;
        label.textContent = frameTickLabel(withinSecond);
        ruler.append(label);
      }
    }
    // The ruler is sticky while tracks scroll. Keeping the grip inside it makes
    // the current-time marker remain attached to the scale instead of leaving
    // its head behind at the top of the scrolled track stack.
    ruler.append(playheadGrip);
  };

  const createTrackLabel = (
    name: string,
    kind: string,
    iconName: string,
    detail: string,
    height: number,
    attached = false,
    hasState = false,
  ): HTMLElement => {
    const label = document.createElement("div");
    label.className = `track-label track-${kind}${hasState ? " track-label-has-state" : ""}`;
    if (attached) label.classList.add("track-label-attached");
    label.style.height = `${height}px`;
    label.title = `${name} · ${detail}`;
    label.innerHTML = `${attached
      ? '<span class="track-attachment-mark" aria-hidden="true"></span>'
      : '<span class="track-icon"></span>'}<span class="track-copy"><strong></strong></span>${hasState
        ? '<span class="track-state"></span>'
        : ""}`;
    if (!attached) setIcon(label.querySelector(".track-icon")!, iconName);
    label.querySelector("strong")!.textContent = name;
    return label;
  };

  const attachedTracks = (
    snapshot: StudioSnapshot,
    slot: string,
    groupId?: string,
  ): readonly StudioSnapshot["tracks"][number][] => snapshot.tracks
    .filter((track) => track.binding.lane.attachedTo === slot
      && (groupId === undefined || track.binding.groupId === groupId))
    .sort((left, right) => (left.binding.lane.order ?? 0) - (right.binding.lane.order ?? 0));

  const buildSemanticLane = (snapshot: StudioSnapshot): void => {
    if (snapshot.semantic.segments.length === 0) {
      return;
    }
    const presentation = snapshot.semantic.presentation;
    // This is one semantic ruler group, not a regular Film lane. Its three
    // bands share the same inner inset as ordinary items, so the first pixel
    // of the semantic content aligns with the first pixel of the label card.
    const laneHeight = presentation.lane.heightPx;
    const bandHeight = Math.max(1, (laneHeight - itemMetrics.insetYPx * 2) / 3);
    const label = createTrackLabel(
      presentation.label ?? "Semantic",
      presentation.tone,
      presentation.icon,
      `${snapshot.semantic.segments.length} take${snapshot.semantic.segments.length === 1 ? "" : "s"}`,
      laneHeight,
    );
    label.classList.add("track-label-semantic");
    labels.append(label);

    const lane = document.createElement("div");
    lane.className = `lane semantic-lane track-tone-${presentation.tone}`;
    lane.style.height = `${laneHeight}px`;
    lane.style.setProperty("--semantic-band-height", `${bandHeight}px`);
    const laneWidth = lanes.clientWidth;
    const nextSemanticNodes: {
      node: HTMLElement;
      id: string;
      start: number;
      end: number;
      kind: "segment" | "word" | "selection" | "moment";
    }[] = [];

    const bands = ["segment", "word", "intent"] as const;
    for (const [index, kind] of bands.entries()) {
      const band = document.createElement("div");
      band.className = `semantic-band semantic-band-${kind}`;
      band.style.top = `${itemMetrics.insetYPx + index * bandHeight}px`;
      lane.append(band);
    }
    const segmentBand = lane.querySelector<HTMLElement>(".semantic-band-segment")!;
    const wordBand = lane.querySelector<HTMLElement>(".semantic-band-word")!;
    const intentBand = lane.querySelector<HTMLElement>(".semantic-band-intent")!;

    for (const segment of snapshot.semantic.segments) {
      const from = place(segment.startFrame, snapshot.space.frameCount, zoom.window());
      const to = place(segment.endFrameExclusive, snapshot.space.frameCount, zoom.window());
      if (to <= 0 || from >= 1) continue;
      const node = document.createElement("button");
      node.type = "button";
      node.className = "semantic-cell semantic-segment";
      node.tabIndex = 0;
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", `Segment ${segment.id}`);
      node.dataset.semanticSegment = segment.id;
      node.style.left = `${from * 100}%`;
      const segmentWidth = Math.max(0, to - from) * 100;
      node.style.width = `max(2px, calc(${segmentWidth}% - ${itemMetrics.gapPx}px))`;
      node.title = segment.id;
      const segmentLabel = document.createElement("span");
      segmentLabel.className = "semantic-segment-label";
      segmentLabel.textContent = segment.id;
      const head = document.createElement("div");
      head.className = "semantic-cell-content";
      head.append(segmentLabel);
      node.append(head);
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        if ((event.target as Element).closest(".semantic-word") !== null) return;
        store.selectSemanticSegment(segment.id, "timeline");
        store.seek(segment.startFrame, "timeline");
      });
      node.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        zoom.focus(
          segment.startFrame / Math.max(1, snapshot.space.frameCount),
          segment.endFrameExclusive / Math.max(1, snapshot.space.frameCount),
        );
      });
      node.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        store.selectSemanticSegment(segment.id, "timeline");
      });
      nextSemanticNodes.push({ node, id: segment.id, start: segment.startFrame, end: segment.endFrameExclusive, kind: "segment" });
      segmentBand.append(node);
    }
    for (const token of snapshot.semantic.tokens) {
      const wordFrom = place(token.startFrame, snapshot.space.frameCount, zoom.window());
      const wordTo = place(token.endFrameExclusive, snapshot.space.frameCount, zoom.window());
      if (wordTo <= 0 || wordFrom >= 1) continue;
      const word = document.createElement("span");
      word.className = "semantic-cell semantic-word";
      word.dataset.semanticToken = token.id;
      word.setAttribute("aria-label", token.text);
      word.style.left = `${wordFrom * 100}%`;
      const wordWidth = Math.max(0, wordTo - wordFrom);
      word.style.width = `max(1px, calc(${wordWidth * 100}% - ${itemMetrics.gapPx}px))`;
      word.title = token.text;
      const text = document.createElement("span");
      text.className = "semantic-word-label";
      text.textContent = token.text;
      const wordWidthPx = Math.max(1, wordWidth * laneWidth - itemMetrics.gapPx);
      const textWidthPx = measuredText(token.text);
      const contentWidthPx = Math.max(0, wordWidthPx - wordLabelPaddingPx * 2);
      const wasReadable = readableWordLabels.has(token.id);
      const textFitsCell = contentWidthPx >= textWidthPx + (wasReadable ? 0 : wordLabelEnterBufferPx);
      if (textFitsCell) readableWordLabels.add(token.id);
      else readableWordLabels.delete(token.id);
      const textFitsViewport = wordFrom >= 0
        && wordFrom * laneWidth + wordLabelPaddingPx * 2 + textWidthPx <= laneWidth;
      word.classList.toggle("word-label-visible", textFitsCell && textFitsViewport);
      const wordContent = document.createElement("span");
      wordContent.className = "semantic-cell-content";
      wordContent.append(text);
      word.append(wordContent);
      word.addEventListener("click", (event) => {
        event.stopPropagation();
        store.seek(token.startFrame, "timeline");
      });
      nextSemanticNodes.push({ node: word, id: token.id, start: token.startFrame, end: token.endFrameExclusive, kind: "word" });
      wordBand.append(word);
    }
    for (const selection of snapshot.semantic.selections) {
      const from = place(selection.startFrame, snapshot.space.frameCount, zoom.window());
      const to = place(selection.endFrameExclusive, snapshot.space.frameCount, zoom.window());
      if (to <= 0 || from >= 1) continue;
      const node = document.createElement("button");
      node.type = "button";
      node.className = "semantic-cell semantic-selection";
      node.tabIndex = 0;
      node.setAttribute("aria-label", `Selection ${selection.id}`);
      node.style.left = `${from * 100}%`;
      node.style.width = `max(2px, calc(${Math.max(0, to - from) * 100}% - ${itemMetrics.gapPx}px))`;
      node.title = selection.id;
      const selectionLabel = document.createElement("span");
      selectionLabel.className = "semantic-selection-label";
      selectionLabel.textContent = selection.id;
      const selectionContent = document.createElement("div");
      selectionContent.className = "semantic-cell-content";
      selectionContent.append(selectionLabel);
      node.append(selectionContent);
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        store.selectSemanticSelection(selection.id, "timeline");
        store.seek(selection.startFrame, "timeline");
      });
      intentBand.append(node);
      nextSemanticNodes.push({ node, id: selection.id, start: selection.startFrame, end: selection.endFrameExclusive, kind: "selection" });
    }
    for (const moment of snapshot.semantic.moments) {
      const at = place(moment.frame, snapshot.space.frameCount, zoom.window());
      if (at < 0 || at > 1) continue;
      const node = document.createElement("button");
      node.type = "button";
      node.className = "semantic-moment";
      node.tabIndex = 0;
      node.setAttribute("aria-label", `Moment ${moment.id}`);
      node.style.left = `${at * 100}%`;
      node.title = moment.id;
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        store.selectSemanticMoment(moment.id, "timeline");
      });
      intentBand.append(node);
      nextSemanticNodes.push({ node, id: moment.id, start: moment.frame, end: moment.frame + 1, kind: "moment" });
    }
    rows.append(lane);
    semanticNodes = nextSemanticNodes;
  };

  const buildTrack = (
    snapshot: StudioSnapshot,
    track: StudioSnapshot["tracks"][number],
    nextClipNodes: { node: HTMLElement; start: number; end: number; id: string }[],
    attached = false,
  ): void => {
    const tone = track.binding.tone;
    const freeFrom: number[] = [];
    const rowOf = new Map<string, number>();
    for (const clip of [...track.clips].sort((a, b) => b.stackOrder - a.stackOrder || a.startFrame - b.startFrame)) {
      let row = freeFrom.findIndex((free) => free <= clip.startFrame);
      if (row < 0) { row = freeFrom.length; freeFrom.push(0); }
      freeFrom[row] = clip.endFrameExclusive;
      rowOf.set(clip.id, row);
    }
    const depth = Math.max(1, freeFrom.length);
    const folded = depth > 1 && !opened.has(track.id);
    const shownRows = folded ? 1 : depth;
    const laneHeight = track.binding.lane.heightPx;
    const displayedItems = track.clips.length;
    const label = createTrackLabel(
      displayTrackName(track),
      tone,
      track.binding.icon,
      `${displayedItems} item${displayedItems === 1 ? "" : "s"}`,
      shownRows * laneHeight,
      attached,
      depth > 1,
    );
    label.classList.add(`track-facet-${track.binding.facet}`);
    if (depth > 1) {
      const fold = document.createElement("button");
      fold.type = "button";
      fold.className = "track-fold";
      fold.textContent = folded ? `+${depth - 1}` : "−";
      fold.title = folded ? `Show ${depth} rows` : "Collapse rows";
      fold.setAttribute("aria-expanded", String(!folded));
      fold.addEventListener("click", (event) => {
        event.stopPropagation();
        if (opened.has(track.id)) opened.delete(track.id);
        else opened.add(track.id);
        build(snapshot);
        paint();
      });
      label.querySelector(".track-state")!.append(fold);
    }
    labels.append(label);

    const lane = document.createElement("div");
    lane.className = `lane track-tone-${tone} track-facet-${track.binding.facet}${attached ? " lane-attached" : ""}`;
    lane.style.height = `${shownRows * laneHeight}px`;
    lane.style.setProperty("--lane-height", `${laneHeight}px`);
    const laneWidth = lanes.clientWidth;
    const materialMounts: {
      readonly target: HTMLElement;
      readonly preview: Extract<StudioSnapshot["tracks"][number]["clips"][number]["display"]["layers"][number], { readonly kind: "preview" }>["preview"];
    }[] = [];
    for (const clip of track.clips) {
      const from = place(clip.startFrame, snapshot.space.frameCount, zoom.window());
      const to = place(clip.endFrameExclusive, snapshot.space.frameCount, zoom.window());
      if (to <= 0 || from >= 1) continue;
      const row = rowOf.get(clip.id) ?? 0;
      if (folded && row > 0) continue;
      const node = document.createElement("button");
      node.type = "button";
      node.className = `clip clip-tone-${tone} clip-facet-${track.binding.facet} clip-chrome-${clip.presentation.chrome}`;
      node.classList.toggle("clip-editable", clip.editHandles.some((handle) => handle.enabled));
      node.dataset.clip = clip.id;
      node.setAttribute("aria-label", clip.display.title);
      node.style.left = `${from * 100}%`;
      node.style.width = `max(2px, calc(${Math.max(0, to - from) * 100}% - ${itemMetrics.gapPx}px))`;
      const visibleWidthPx = visibleItemWidth(from, to, laneWidth);
      node.classList.toggle("clip-preview-wide", visibleWidthPx >= 92);
      node.style.top = `${row * laneHeight}px`;
      node.title = `${clip.display.title} · ${clip.startFrame}-${clip.endFrameExclusive}f`;
      node.innerHTML = `<span class="clip-head"><span class="clip-name"></span><span class="clip-meta"></span></span><span class="clip-body"><span class="clip-layers" aria-hidden="true"></span><span class="clip-phases"></span></span><span class="clip-selection" aria-hidden="true"></span>`;
      const layers = node.querySelector<HTMLElement>(".clip-layers")!;
      clip.display.layers.forEach((layer, index) => {
        const layerNode = document.createElement("span");
        layerNode.className = `clip-layer clip-layer-${layer.kind} clip-layer-role-${layer.role}`;
        layerNode.style.zIndex = String(index + 1);
        if (layer.kind === "text") {
          layerNode.textContent = layer.text;
        } else {
          layerNode.classList.add(`clip-layer-layout-${layer.layout}`);
          materialMounts.push({ target: layerNode, preview: layer.preview });
        }
        layers.append(layerNode);
      });
      const phaseLayer = node.querySelector<HTMLElement>(".clip-phases")!;
      for (const phase of clip.temporal?.phases ?? []) {
        if (phase.endFrameExclusive <= clip.startFrame || phase.startFrame >= clip.endFrameExclusive) continue;
        const phaseNode = document.createElement("span");
        phaseNode.className = `clip-phase clip-phase-${phase.role}`;
        phaseNode.style.left = `${(phase.startFrame - clip.startFrame) / Math.max(1, clip.endFrameExclusive - clip.startFrame) * 100}%`;
        phaseNode.style.width = `${(phase.endFrameExclusive - phase.startFrame) / Math.max(1, clip.endFrameExclusive - clip.startFrame) * 100}%`;
        phaseLayer.append(phaseNode);
      }
      const metaText = clip.presentation.chrome === "point"
        ? `${(clip.startFrame / fps(snapshot)).toFixed(2)}s`
        : `${((clip.endFrameExclusive - clip.startFrame) / fps(snapshot)).toFixed(2)}s`;
      const headerLabel = node.querySelector<HTMLElement>(".clip-name")!;
      node.querySelector(".clip-meta")!.textContent = metaText;
      headerLabel.textContent = clip.display.title;
      node.addEventListener("pointerdown", (event) => {
        const rect = node.getBoundingClientRect();
        const edge = Math.min(8, Math.max(4, rect.width / 3));
        const nearStart = event.clientX - rect.left <= edge;
        const nearEnd = rect.right - event.clientX <= edge;
        const handle = clip.editHandles.find((candidate) =>
          candidate.enabled
          && ((candidate.gesture === "trim-start" && nearStart)
            || (candidate.gesture === "trim-end" && nearEnd)
            || (candidate.gesture === "move" && !nearStart && !nearEnd)));
        if (handle !== undefined
          && (handle.gesture === "move" || handle.gesture === "trim-start" || handle.gesture === "trim-end")) {
          event.stopPropagation();
          const pointerFrame = handle.coordinate === "semantic-anchor"
            ? rawFrameAt(event.clientX)
            : frameAt(event.clientX);
          const pointerAnchorIndex = handle.semantic !== undefined
            ? nearestAnchorIndex(
                pointerFrame,
                state?.snapshot.semantic.anchors.map((_, index) => index) ?? [],
              )
            : undefined;
          activeEdit = {
            clip,
            handle,
            startFrame: pointerFrame,
            ...(pointerAnchorIndex === undefined ? {} : { pointerAnchorIndex }),
            pointerId: event.pointerId,
            node,
            originalLeft: node.style.left,
            originalWidth: node.style.width,
          };
          node.classList.add("editing");
          try { lanes.setPointerCapture(event.pointerId); } catch { /* local pointer */ }
          store.select(clip.id, "timeline");
          return;
        }
        store.select(clip.id, "timeline");
      });
      node.addEventListener("dblclick", () => store.seek(clip.startFrame, "timeline"));
      nextClipNodes.push({ node, start: clip.startFrame, end: clip.endFrameExclusive, id: clip.id });
      lane.append(node);
    }
    rows.append(lane);
    for (const item of materialMounts) mountMaterialPreview(item.target, item.preview);
  };

  const build = (snapshot: StudioSnapshot): void => {
    const scrollTop = body.scrollTop;
    labels.replaceChildren();
    rows.replaceChildren();
    semanticNodes = [];
    const corner = document.createElement("div");
    corner.className = "label-corner";
    corner.textContent = "";
    labels.append(corner);
    buildSemanticLane(snapshot);
    const nextClipNodes: { node: HTMLElement; start: number; end: number; id: string }[] = [];
    for (const track of snapshot.tracks) {
      const attachedTo = track.binding.lane.attachedTo;
      if (attachedTo !== undefined) continue;
      buildTrack(snapshot, track, nextClipNodes);
      const slot = track.binding.lane.groupId;
      if (slot === undefined) continue;
      const attachments = attachedTracks(snapshot, slot, track.binding.groupId);
      for (const attachment of attachments) {
        buildTrack(snapshot, attachment, nextClipNodes, true);
      }
    }
    clipNodes = nextClipNodes;
    drawRuler(snapshot);
    // Replacing every row briefly collapses the scroll surface. Preserve the
    // vertical reading position when a horizontal pan rebuilds the window.
    body.scrollTop = scrollTop;
  };

  const paint = (): void => {
    if (state === undefined) return;
    const { snapshot, selection, playhead: head } = state;
    const position = place(head.frame, snapshot.space.frameCount, zoom.window()) * lanes.clientWidth;
    if (head.origin === "play" && position > lanes.clientWidth * 0.88 && zoom.window().end < 0.9999) {
      zoom.slide(Math.max(0.25, position / Math.max(1, lanes.clientWidth) - 0.18));
      return;
    }
    playhead.style.transform = `translate3d(${position}px,0,0)`;
    playheadGrip.style.transform = `translate3d(${position - 5}px,0,0)`;
    playhead.classList.toggle("outside", position < 0 || position > lanes.clientWidth);
    playheadGrip.classList.toggle("outside", position < 0 || position > lanes.clientWidth);
    timelineTime.textContent = frameTimecode(snapshot, head.frame);
    for (const item of clipNodes) {
      const selected = selection.kind === "clip" && selection.clipId === item.id;
      item.node.classList.toggle("selected", selected);
      item.node.setAttribute("aria-pressed", String(selected));
      item.node.classList.toggle("live", head.frame >= item.start && head.frame < item.end);
    }
    for (const item of semanticNodes) {
      item.node.classList.toggle("live",
        (item.kind === "segment" || item.kind === "selection")
        && head.frame >= item.start && head.frame < item.end);
      item.node.classList.toggle("current", item.kind === "word" && head.frame >= item.start && head.frame < item.end);
      const selected = (item.kind === "segment"
        && selection.kind === "semantic-segment" && selection.segmentId === item.id)
        || (item.kind === "selection"
          && selection.kind === "semantic-selection" && selection.selectionId === item.id)
        || (item.kind === "moment"
          && selection.kind === "semantic-moment" && selection.momentId === item.id);
      item.node.classList.toggle("selected", selected);
      if (item.kind !== "word") item.node.setAttribute("aria-pressed", String(selected));
    }
  };

  const schedulePaint = (): void => {
    if (paintFrame !== 0) return;
    paintFrame = requestAnimationFrame(() => {
      paintFrame = 0;
      paint();
    });
  };

  const scheduleBuild = (): void => {
    if (rebuildFrame !== 0 || state === undefined) return;
    rebuildFrame = requestAnimationFrame(() => {
      rebuildFrame = 0;
      if (state === undefined) return;
      build(state.snapshot);
      paint();
    });
  };

  lanes.addEventListener("wheel", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      event.preventDefault();
      const box = lanes.getBoundingClientRect();
      const at = box.width === 0 ? 0.5 : (event.clientX - box.left) / box.width;
      zoom.pinch(at, Math.exp(event.deltaY * 0.004));
      return;
    }
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      event.preventDefault();
      const delta = event.shiftKey ? event.deltaY : event.deltaX;
      zoom.slide(delta / Math.max(1, lanes.clientWidth));
    }
  }, { passive: false });

  zoom.subscribe(scheduleBuild);
  store.subscribe((value) => {
    state = value;
    if (value.snapshot.revision !== built) {
      built = value.snapshot.revision;
      build(value.snapshot);
    }
    schedulePaint();
  });
  const resizeObserver = new ResizeObserver(() => {
    if (state !== undefined) scheduleBuild();
  });
  resizeObserver.observe(element);
  resizeObserver.observe(lanes);

  return { element, zoomIn, zoomOut, fit };
}
