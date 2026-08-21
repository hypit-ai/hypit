import type {
  SemanticToken,
  StudioSnapshot,
} from "../shared.js";
import { icon, setIcon } from "./icons.js";
import { mountMaterialPreview } from "./material-preview.js";
import type { State, Store } from "./selection.js";
import { createZoom } from "./zoom.js";

export type Timeline = {
  readonly element: HTMLElement;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly fit: () => void;
};

const opened = new Set<string>();
const expandedAttachmentGroups = new Set<string>();
const collapsedAttachmentGroups = new Set<string>();
const itemMetrics = {
  // Ordinary items fill their rows. Only the semantic lane owns compact word cells.
  insetYPx: 1,
  headerPx: 15,
  contentCellPx: 18,
  gapPx: 1,
} as const;

const measuredText = (() => {
  const context = document.createElement("canvas").getContext("2d");
  const cache = new Map<string, number>();
  return (value: string, font: string): number => {
    const key = `${font}\u0000${value}`;
    const existing = cache.get(key);
    if (existing !== undefined) return existing;
    if (context === null) return value.length * 7;
    context.font = font;
    const width = context.measureText(value).width;
    cache.set(key, width);
    return width;
  };
})();

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

function clipHeaderLabel(clip: StudioSnapshot["tracks"][number]["clips"][number]): string {
  return clip.presentation.shape === "text" ? clip.authoredId : clip.label;
}

function clipBodyLabel(clip: StudioSnapshot["tracks"][number]["clips"][number]): string {
  return clip.presentation.shape === "text" ? clip.label : "";
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

  let state: State | undefined;
  let built = -1;
  let paintFrame = 0;
  let rebuildFrame = 0;
  let semanticLane: HTMLElement | undefined;
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
    readonly kind: "segment" | "word";
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

  const frameAt = (clientX: number): number => {
    const box = lanes.getBoundingClientRect();
    if (box.width === 0 || state === undefined) return 0;
    const across = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    const shown = zoom.window();
    return snapFrame(Math.floor(
      (shown.start + across * (shown.end - shown.start)) * state.snapshot.space.frameCount,
    ));
  };

  const frameTimecode = (snapshot: StudioSnapshot, frame: number): string => {
    const rate = Math.max(1, Math.round(fps(snapshot)));
    const seconds = Math.floor(frame / fps(snapshot));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}:${String(frame % rate).padStart(2, "0")}`;
  };

  let pointerArmed = false;
  let pointerDownX = 0;
  let pointerDownOnItem = false;
  lanes.addEventListener("pointerdown", (event) => {
    pointerDownOnItem = (event.target as HTMLElement).closest(".clip, .semantic-segment, .semantic-word") !== null;
    pointerDownX = event.clientX;
    pointerArmed = true;
    try { lanes.setPointerCapture(event.pointerId); } catch { /* pointer remains local */ }
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
    if (!pointerArmed || event.buttons !== 1) return;
    if (pointerDownOnItem && Math.abs(event.clientX - pointerDownX) < 3) return;
    store.seek(frame, "timeline");
  });
  const finishPointer = (event: PointerEvent): void => {
    pointerArmed = false;
    try { lanes.releasePointerCapture(event.pointerId); } catch { /* already released */ }
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
  ): HTMLElement => {
    const label = document.createElement("div");
    label.className = `track-label track-${kind}`;
    if (attached) label.classList.add("track-label-attached");
    label.style.height = `${height}px`;
    label.title = `${name} · ${detail}`;
    label.innerHTML = `<span class="track-icon"></span><span class="track-copy"><strong></strong></span><span class="track-state"></span>`;
    setIcon(label.querySelector(".track-icon")!, iconName);
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

  const attachmentExpanded = (
    key: string,
    attachments: readonly StudioSnapshot["tracks"][number][],
  ): boolean => !collapsedAttachmentGroups.has(key)
    && (expandedAttachmentGroups.has(key)
      || attachments.some((track) => track.binding.lane.expandedByDefault === true));

  const addAttachmentToggle = (
    label: HTMLElement,
    key: string,
    count: number,
    snapshot: StudioSnapshot,
  ): void => {
    if (count === 0) return;
    const fold = document.createElement("button");
    fold.type = "button";
    fold.className = "track-fold attachment-fold";
    const expanded = !collapsedAttachmentGroups.has(key)
      && (expandedAttachmentGroups.has(key)
        || snapshot.tracks.some((track) => {
          const slot = track.binding.lane.attachedTo;
          return slot !== undefined
            && `track:${track.binding.groupId}:${slot}` === key
            && track.binding.lane.expandedByDefault === true;
        }));
    fold.classList.toggle("expanded", expanded);
    fold.textContent = "";
    fold.title = expanded ? "Hide attached facets" : "Show attached facets";
    fold.setAttribute("aria-expanded", String(expanded));
    fold.addEventListener("click", (event) => {
      event.stopPropagation();
      if (expanded) {
        collapsedAttachmentGroups.add(key);
        expandedAttachmentGroups.delete(key);
      } else {
        collapsedAttachmentGroups.delete(key);
        expandedAttachmentGroups.add(key);
      }
      build(snapshot);
      paint();
    });
    label.querySelector(".track-state")!.append(fold);
  };

  const buildSemanticLane = (snapshot: StudioSnapshot): void => {
    if (snapshot.semantic.segments.length === 0) {
      semanticLane = undefined;
      return;
    }
    const presentation = snapshot.semantic.presentation;
    const laneHeight = presentation.lane.height.preferredPx;
    const label = createTrackLabel(
      presentation.label ?? "Speech",
      presentation.family,
      presentation.icon,
      `${snapshot.semantic.segments.length} take${snapshot.semantic.segments.length === 1 ? "" : "s"}`,
      laneHeight,
    );
    const groupId = presentation.lane.groupId;
    const attachmentKey = groupId === undefined ? undefined : `semantic:${groupId}`;
    const facets = groupId === undefined ? [] : attachedTracks(snapshot, groupId);
    if (attachmentKey !== undefined) addAttachmentToggle(label, attachmentKey, facets.length, snapshot);
    labels.append(label);

    const lane = document.createElement("div");
    lane.className = `lane semantic-lane track-${presentation.family}`;
    lane.style.height = `${laneHeight}px`;
    lane.style.setProperty("--lane-min-height", `${presentation.lane.height.minPx}px`);
    lane.style.setProperty("--lane-max-height", `${presentation.lane.height.maxPx}px`);
    semanticLane = lane;
    const laneWidth = lanes.clientWidth;
    const tokensBySegment = new Map<string, SemanticToken[]>();
    for (const token of snapshot.semantic.tokens) {
      const held = tokensBySegment.get(token.segmentId);
      if (held === undefined) tokensBySegment.set(token.segmentId, [token]);
      else held.push(token);
    }
    const nextSemanticNodes: { node: HTMLElement; id: string; start: number; end: number; kind: "segment" | "word" }[] = [];

    for (const segment of snapshot.semantic.segments) {
      const from = place(segment.startFrame, snapshot.space.frameCount, zoom.window());
      const to = place(segment.endFrameExclusive, snapshot.space.frameCount, zoom.window());
      if (to <= 0 || from >= 1) continue;
      const visibleFrom = Math.max(0, from);
      const visibleTo = Math.min(1, to);
      const node = document.createElement("div");
      node.className = "semantic-segment";
      node.tabIndex = 0;
      node.setAttribute("role", "button");
      node.dataset.semanticSegment = segment.id;
      node.style.left = `${visibleFrom * 100}%`;
      const segmentWidth = Math.max(0, visibleTo - visibleFrom) * 100;
      node.style.width = `max(2px, calc(${segmentWidth}% - ${itemMetrics.gapPx}px))`;
      node.title = `${segment.id} · ${segment.startFrame}-${segment.endFrameExclusive}f`;
      const segmentLabel = document.createElement("span");
      segmentLabel.className = "semantic-segment-label";
      segmentLabel.textContent = segment.id;
      const visibleWidthPx = Math.max(0, visibleTo - visibleFrom) * laneWidth;
      node.classList.toggle("semantic-coarse", visibleWidthPx < 92);
      node.classList.toggle("semantic-wide", visibleWidthPx >= 140);
      node.classList.toggle("label-hidden",
        measuredText(segment.id, "500 11px -apple-system, system-ui, Segoe UI, sans-serif") + 18 > visibleWidthPx);
      const head = document.createElement("div");
      head.className = "semantic-segment-head";
      const segmentDuration = document.createElement("span");
      segmentDuration.className = "semantic-segment-duration";
      segmentDuration.textContent = `${segment.endFrameExclusive - segment.startFrame}f`;
      head.append(segmentLabel, segmentDuration);
      node.append(head);
      node.addEventListener("pointerdown", (event) => {
        if ((event.target as Element).closest(".semantic-word") !== null) return;
        store.selectSemanticSegment(segment.id, "timeline");
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

      const words = document.createElement("div");
      words.className = "semantic-words";
      for (const token of tokensBySegment.get(segment.id) ?? []) {
        const wordFrom = place(token.startFrame, snapshot.space.frameCount, zoom.window());
        const wordTo = place(token.endFrameExclusive, snapshot.space.frameCount, zoom.window());
        if (wordTo <= 0 || wordFrom >= 1) continue;
        const word = document.createElement("button");
        word.type = "button";
        word.className = "semantic-word";
        word.dataset.semanticToken = token.id;
        const span = Math.max(1e-6, visibleTo - visibleFrom);
        const clippedFrom = Math.max(visibleFrom, wordFrom);
        const clippedTo = Math.min(visibleTo, wordTo);
        word.style.left = `${Math.max(0, clippedFrom - visibleFrom) / span * 100}%`;
        word.style.width = `max(1px, calc(${Math.max(0, clippedTo - clippedFrom) / span * 100}% - 1px))`;
        word.title = `${token.text} · ${token.startFrame}-${token.endFrameExclusive}f`;
        const text = document.createElement("span");
        text.className = "semantic-word-label";
        text.textContent = token.text;
        word.append(text);
        const widthPx = Math.max(0, clippedTo - clippedFrom) / span * visibleWidthPx;
        word.classList.toggle("label-hidden",
          measuredText(token.text, "500 11px -apple-system, system-ui, Segoe UI, sans-serif") + 18 > widthPx);
        word.addEventListener("pointerdown", () => {
          store.selectSemanticSegment(segment.id, "timeline");
          store.seek(token.startFrame, "timeline");
        });
        nextSemanticNodes.push({ node: word, id: segment.id, start: token.startFrame, end: token.endFrameExclusive, kind: "word" });
        words.append(word);
      }
      node.append(words);
      const selection = document.createElement("span");
      selection.className = "clip-selection";
      selection.setAttribute("aria-hidden", "true");
      node.append(selection);
      lane.append(node);
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
    const kind = track.binding.family;
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
    const laneHeight = track.binding.lane.height.preferredPx;
    const displayedItems = track.clips.length;
    const label = createTrackLabel(
      displayTrackName(track),
      kind,
      track.binding.icon,
      `${displayedItems} item${displayedItems === 1 ? "" : "s"}`,
      shownRows * laneHeight,
      attached,
    );
    label.classList.add(`track-facet-${track.binding.facet}`);
    const attachmentSlot = track.binding.lane.groupId;
    const attachmentKey = attachmentSlot === undefined
      ? undefined
      : `track:${track.binding.groupId}:${attachmentSlot}`;
    const attachments = attachmentSlot === undefined
      ? []
      : attachedTracks(snapshot, attachmentSlot, track.binding.groupId);
    if (attachmentKey !== undefined) addAttachmentToggle(label, attachmentKey, attachments.length, snapshot);
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
    lane.className = `lane track-${kind} track-facet-${track.binding.facet}${attached ? " lane-attached" : ""}`;
    lane.style.height = `${shownRows * laneHeight}px`;
    lane.style.setProperty("--lane-height", `${laneHeight}px`);
    lane.style.setProperty("--lane-min-height", `${track.binding.lane.height.minPx}px`);
    lane.style.setProperty("--lane-max-height", `${track.binding.lane.height.maxPx}px`);
    const laneWidth = lanes.clientWidth;
    const materialMounts: {
      readonly target: HTMLElement;
      readonly preview: NonNullable<StudioSnapshot["tracks"][number]["clips"][number]["preview"]>;
    }[] = [];
    for (const clip of track.clips) {
      const from = place(clip.startFrame, snapshot.space.frameCount, zoom.window());
      const to = place(clip.endFrameExclusive, snapshot.space.frameCount, zoom.window());
      if (to <= 0 || from >= 1) continue;
      const row = rowOf.get(clip.id) ?? 0;
      if (folded && row > 0) continue;
      const node = document.createElement("button");
      node.type = "button";
      node.className = `clip clip-${kind} clip-facet-${track.binding.facet} clip-shape-${clip.presentation.shape}`;
      node.dataset.clip = clip.id;
      node.style.left = `${from * 100}%`;
      node.style.width = `max(2px, calc(${Math.max(0, to - from) * 100}% - ${itemMetrics.gapPx}px))`;
      const widthPx = Math.max(0, to - from) * laneWidth;
      node.classList.toggle("clip-wide", widthPx >= 110);
      node.classList.toggle("clip-preview-wide", widthPx >= 92);
      node.style.top = `${row * laneHeight}px`;
      node.title = `${clip.label} · ${clip.startFrame}-${clip.endFrameExclusive}f`;
      node.innerHTML = `<span class="clip-head"><span class="clip-name"></span><span class="clip-meta"></span></span><span class="clip-body"><span class="clip-material" aria-hidden="true"></span><span class="clip-content"><span class="clip-content-text"></span></span><span class="clip-phases"></span></span><span class="clip-selection" aria-hidden="true"></span>`;
      const material = node.querySelector<HTMLElement>(".clip-material")!;
      if (clip.preview !== undefined) {
        node.classList.add("clip-has-material");
        materialMounts.push({ target: material, preview: clip.preview });
      }
      const phaseLayer = node.querySelector<HTMLElement>(".clip-phases")!;
      for (const phase of clip.temporal?.phases ?? []) {
        if (phase.endFrameExclusive <= clip.startFrame || phase.startFrame >= clip.endFrameExclusive) continue;
        const phaseNode = document.createElement("span");
        phaseNode.className = `clip-phase clip-phase-${phase.role}`;
        phaseNode.style.left = `${(phase.startFrame - clip.startFrame) / Math.max(1, clip.endFrameExclusive - clip.startFrame) * 100}%`;
        phaseNode.style.width = `${(phase.endFrameExclusive - phase.startFrame) / Math.max(1, clip.endFrameExclusive - clip.startFrame) * 100}%`;
        phaseLayer.append(phaseNode);
      }
      node.querySelector(".clip-name")!.textContent = clipHeaderLabel(clip);
      node.querySelector(".clip-meta")!.textContent = `${((clip.endFrameExclusive - clip.startFrame) / fps(snapshot)).toFixed(2)}s`;
      node.querySelector(".clip-content-text")!.textContent = clipBodyLabel(clip);
      node.addEventListener("pointerdown", () => {
        if (clip.interaction.select) store.select(clip.id, "timeline");
      });
      node.addEventListener("dblclick", () => store.seek(clip.startFrame, "timeline"));
      nextClipNodes.push({ node, start: clip.startFrame, end: clip.endFrameExclusive, id: clip.id });
      lane.append(node);
    }
    rows.append(lane);
    for (const item of materialMounts) mountMaterialPreview(item.target, item.preview);
  };

  const build = (snapshot: StudioSnapshot): void => {
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
      const key = slot === undefined ? undefined : `track:${track.binding.groupId}:${slot}`;
      if (slot === undefined || key === undefined) continue;
      const attachments = attachedTracks(snapshot, slot, track.binding.groupId);
      if (!attachmentExpanded(key, attachments)) continue;
      for (const attachment of attachments) {
        buildTrack(snapshot, attachment, nextClipNodes, true);
      }
    }
    clipNodes = nextClipNodes;
    drawRuler(snapshot);
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
      item.node.classList.toggle("live", item.kind === "segment" && head.frame >= item.start && head.frame < item.end);
      item.node.classList.toggle("current", item.kind === "word" && head.frame >= item.start && head.frame < item.end);
      item.node.classList.toggle("selected", item.kind === "segment"
        && selection.kind === "semantic-segment" && selection.segmentId === item.id);
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
  new ResizeObserver(() => {
    if (state !== undefined) scheduleBuild();
  }).observe(element);

  return { element, zoomIn, zoomOut, fit };
}
