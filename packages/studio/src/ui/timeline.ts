import type {
  SemanticAnchor,
  SemanticToken,
  StudioSnapshot,
  StudioTemporalLineage,
} from "../shared.js";
import { icon, setIcon } from "./icons.js";
import type { State, Store } from "./selection.js";
import { createZoom } from "./zoom.js";

export type Timeline = { readonly element: HTMLElement };

const LANE_HEIGHT = 52;
const opened = new Set<string>();
let speechExpanded = false;

function tickSeconds(durationSec: number, widthPx: number): number {
  for (const step of [1, 2, 5, 10, 15, 30, 60]) {
    if (durationSec / step <= Math.max(2, widthPx / 72)) return step;
  }
  return 120;
}

function timecode(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

function place(frame: number, frameCount: number, shown: { start: number; end: number }): number {
  const span = Math.max(1e-6, shown.end - shown.start);
  return (frame / Math.max(1, frameCount) - shown.start) / span;
}

function displayTrackName(track: StudioSnapshot["tracks"][number]): string {
  if (track.binding.family === "speech") return track.binding.facet === "audio" ? "Voice" : "Picture";
  const base = track.label.replace(/\.(?:track|visual|audio)$/u, "");
  return base.length === 0 ? track.label : base;
}

function sourceWindow(
  snapshot: StudioSnapshot,
  source: StudioTemporalLineage["source"],
): { readonly start: number; readonly end: number } | undefined {
  if (source.kind === "selection") {
    const match = snapshot.semantic.selections.find((item) => item.id === source.id
      && (source.occurrenceId === undefined || source.occurrenceId === item.occurrenceId));
    return match === undefined ? undefined : { start: match.startFrame, end: match.endFrameExclusive };
  }
  if (source.kind === "moment") {
    const match = snapshot.semantic.moments.find((item) => item.id === source.id
      && (source.occurrenceId === undefined || source.occurrenceId === item.occurrenceId));
    return match === undefined ? undefined : { start: match.frame, end: match.frame };
  }
  if (source.kind === "segment") {
    const match = snapshot.semantic.segments.find((item) => item.id === source.id);
    return match === undefined ? undefined : { start: match.startFrame, end: match.endFrameExclusive };
  }
  return undefined;
}

function sourceFrame(
  snapshot: StudioSnapshot,
  source: StudioTemporalLineage["source"],
  endpoint: "start" | "end",
): number | undefined {
  const window = sourceWindow(snapshot, source);
  if (window === undefined) return undefined;
  return endpoint === "start" ? window.start : window.end;
}

export function createTimeline(store: Store): Timeline {
  const element = document.createElement("section");
  element.className = "timeline";
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
        <div class="ruler" data-ruler></div>
        <div class="lanes" data-rows></div>
        <svg class="projection-overlay" data-projection aria-hidden="true"></svg>
        <div class="playhead" data-playhead><div class="playhead-grip"></div></div>
      </div>
    </div>
    <div class="timeline-zoom" data-zoom></div>`;

  const labels = element.querySelector<HTMLElement>("[data-labels]")!;
  const lanes = element.querySelector<HTMLElement>("[data-lanes]")!;
  const ruler = element.querySelector<HTMLElement>("[data-ruler]")!;
  const rows = element.querySelector<HTMLElement>("[data-rows]")!;
  const projectionOverlay = element.querySelector<SVGSVGElement>("[data-projection]")!;
  const playhead = element.querySelector<HTMLElement>("[data-playhead]")!;
  const timelineTime = element.querySelector<HTMLElement>("[data-timeline-time]")!;
  const zoom = createZoom();
  element.querySelector<HTMLElement>("[data-zoom]")!.append(zoom.element);
  element.querySelector<HTMLButtonElement>("[data-zoom-out]")!
    .addEventListener("click", () => zoom.pinch(0.5, 1.45));
  element.querySelector<HTMLButtonElement>("[data-zoom-in]")!
    .addEventListener("click", () => zoom.pinch(0.5, 0.68));
  element.querySelector<HTMLButtonElement>("[data-zoom-fit]")!
    .addEventListener("click", () => zoom.fit());

  let state: State | undefined;
  let built = -1;
  let paintFrame = 0;
  let rebuildFrame = 0;
  let projectionKey = "";
  let semanticLane: HTMLElement | undefined;
  let clipNodes: readonly {
    readonly node: HTMLElement;
    readonly start: number;
    readonly end: number;
    readonly id: string;
  }[] = [];
  let semanticNodes: readonly {
    readonly node: HTMLElement;
    readonly start: number;
    readonly end: number;
    readonly kind: "segment" | "word";
  }[] = [];

  const fps = (snapshot: StudioSnapshot): number =>
    snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;

  const frameAt = (clientX: number): number => {
    const box = lanes.getBoundingClientRect();
    if (box.width === 0 || state === undefined) return 0;
    const across = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    const shown = zoom.window();
    return Math.floor((shown.start + across * (shown.end - shown.start)) * state.snapshot.space.frameCount);
  };

  const scrub = (event: PointerEvent): void => {
    try { lanes.setPointerCapture(event.pointerId); } catch { /* pointer remains local */ }
    store.seek(frameAt(event.clientX), "timeline");
  };

  lanes.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest(".clip, .semantic-segment, .semantic-word") !== null) return;
    store.clearSelection();
    scrub(event);
  });
  lanes.addEventListener("pointermove", (event) => {
    if (event.buttons === 1 && lanes.hasPointerCapture(event.pointerId)) scrub(event);
  });

  const drawRuler = (snapshot: StudioSnapshot): void => {
    ruler.replaceChildren();
    const step = tickSeconds(snapshot.space.durationSec, lanes.clientWidth);
    for (let seconds = 0; seconds <= snapshot.space.durationSec; seconds += step) {
      const at = place(seconds * fps(snapshot), snapshot.space.frameCount, zoom.window());
      if (at < 0 || at > 1) continue;
      const tick = document.createElement("span");
      tick.className = `tick${at > 0.94 ? " tick-last" : ""}`;
      tick.style.left = `${at * 100}%`;
      tick.textContent = timecode(seconds);
      ruler.append(tick);
    }
    for (const segment of snapshot.semantic.segments) {
      const from = place(segment.startFrame, snapshot.space.frameCount, zoom.window());
      const to = place(segment.endFrameExclusive, snapshot.space.frameCount, zoom.window());
      if (to <= 0 || from >= 1) continue;
      const marker = document.createElement("span");
      marker.className = "ruler-segment";
      marker.style.left = `${Math.max(0, from) * 100}%`;
      marker.style.width = `${Math.max(0, Math.min(1, to) - Math.max(0, from)) * 100}%`;
      marker.textContent = segment.id;
      ruler.append(marker);
    }
  };

  const createTrackLabel = (
    name: string,
    kind: string,
    iconName: string,
    detail: string,
    height = LANE_HEIGHT,
  ): HTMLElement => {
    const label = document.createElement("div");
    label.className = `track-label track-${kind}`;
    label.style.height = `${height}px`;
    label.innerHTML = `<span class="track-icon"></span><span class="track-copy"><strong></strong><small></small></span><span class="track-state"></span>`;
    setIcon(label.querySelector(".track-icon")!, iconName);
    label.querySelector("strong")!.textContent = name;
    label.querySelector("small")!.textContent = detail;
    return label;
  };

  const buildSemanticLane = (snapshot: StudioSnapshot): void => {
    if (snapshot.semantic.segments.length === 0) {
      semanticLane = undefined;
      return;
    }
    const label = createTrackLabel(
      "Speech",
      "speech",
      "speech",
      `${snapshot.semantic.segments.length} take${snapshot.semantic.segments.length === 1 ? "" : "s"}`,
    );
    const facets = snapshot.tracks.filter((track) => track.binding.family === "speech").length;
    if (facets > 0) {
      const fold = document.createElement("button");
      fold.type = "button";
      fold.className = "track-fold speech-fold";
      fold.textContent = speechExpanded ? "−" : "+";
      fold.title = speechExpanded ? "Hide picture and voice facets" : "Show picture and voice facets";
      fold.setAttribute("aria-expanded", String(speechExpanded));
      fold.addEventListener("click", (event) => {
        event.stopPropagation();
        speechExpanded = !speechExpanded;
        build(snapshot);
        paint();
      });
      label.querySelector(".track-state")!.append(fold);
    }
    labels.append(label);

    const lane = document.createElement("div");
    lane.className = "lane semantic-lane track-speech";
    lane.style.height = `${LANE_HEIGHT}px`;
    semanticLane = lane;
    const tokensBySegment = new Map<string, SemanticToken[]>();
    for (const token of snapshot.semantic.tokens) {
      const held = tokensBySegment.get(token.segmentId);
      if (held === undefined) tokensBySegment.set(token.segmentId, [token]);
      else held.push(token);
    }
    const anchorsBySegment = new Map<string, SemanticAnchor[]>();
    for (const anchor of snapshot.semantic.anchors) {
      const held = anchorsBySegment.get(anchor.segmentId);
      if (held === undefined) anchorsBySegment.set(anchor.segmentId, [anchor]);
      else held.push(anchor);
    }
    const nextSemanticNodes: { node: HTMLElement; start: number; end: number; kind: "segment" | "word" }[] = [];
    const measured: { node: HTMLElement; label: HTMLElement; segment: boolean }[] = [];

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
      node.style.width = `${Math.max(0, visibleTo - visibleFrom) * 100}%`;
      node.title = `${segment.id} · ${segment.startFrame}-${segment.endFrameExclusive}f`;
      const segmentLabel = document.createElement("span");
      segmentLabel.className = "semantic-segment-label";
      segmentLabel.textContent = segment.id;
      node.append(segmentLabel);
      measured.push({ node, label: segmentLabel, segment: true });
      node.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
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
        store.seek(segment.startFrame, "timeline");
      });
      nextSemanticNodes.push({ node, start: segment.startFrame, end: segment.endFrameExclusive, kind: "segment" });

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
        word.style.width = `${Math.max(0, clippedTo - clippedFrom) / span * 100}%`;
        word.title = `${token.text} · ${token.startFrame}-${token.endFrameExclusive}f`;
        const text = document.createElement("span");
        text.className = "semantic-word-label";
        text.textContent = token.text;
        word.append(text);
        measured.push({ node: word, label: text, segment: false });
        word.addEventListener("pointerdown", (event) => {
          event.stopPropagation();
          store.seek(token.startFrame, "timeline");
        });
        nextSemanticNodes.push({ node: word, start: token.startFrame, end: token.endFrameExclusive, kind: "word" });
        words.append(word);
      }
      node.append(words);

      for (const anchor of anchorsBySegment.get(segment.id) ?? []) {
        const at = place(anchor.frame, snapshot.space.frameCount, zoom.window());
        if (at < from || at > to) continue;
        const tick = document.createElement("span");
        tick.className = `semantic-anchor semantic-anchor-${anchor.kind}`;
        tick.style.left = `${(at - from) / Math.max(1e-6, to - from) * 100}%`;
        node.append(tick);
      }
      lane.append(node);
    }
    rows.append(lane);
    semanticNodes = nextSemanticNodes;
    requestAnimationFrame(() => {
      for (const item of measured) {
        item.node.classList.toggle("label-hidden", item.label.scrollWidth + 6 > item.label.clientWidth);
        if (item.segment) item.node.classList.toggle("semantic-coarse", item.node.clientWidth < 92);
      }
    });
  };

  const buildTrack = (
    snapshot: StudioSnapshot,
    track: StudioSnapshot["tracks"][number],
    nextClipNodes: { node: HTMLElement; start: number; end: number; id: string }[],
  ): void => {
    const kind = track.binding.family;
    const freeFrom: number[] = [];
    const rowOf = new Map<string, number>();
    const roots = track.clips.filter((clip) => clip.presentation.parentId === undefined);
    const childrenByParent = new Map<string, typeof track.clips>();
    for (const clip of track.clips) {
      const parentId = clip.presentation.parentId;
      if (parentId !== undefined) childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), clip]);
    }
    for (const clip of [...roots].sort((a, b) => b.stackOrder - a.stackOrder || a.startFrame - b.startFrame)) {
      let row = freeFrom.findIndex((free) => free <= clip.startFrame);
      if (row < 0) { row = freeFrom.length; freeFrom.push(0); }
      freeFrom[row] = clip.endFrameExclusive;
      rowOf.set(clip.id, row);
    }
    for (const clip of track.clips) {
      const parentId = clip.presentation.parentId;
      if (parentId !== undefined) rowOf.set(clip.id, rowOf.get(parentId) ?? 0);
    }
    const depth = Math.max(1, freeFrom.length);
    const folded = depth > 1 && !opened.has(track.id);
    const shownRows = folded ? 1 : depth;
    const nestedItems = track.clips.filter((clip) => clip.presentation.parentId !== undefined).length;
    const displayedItems = nestedItems > 0 ? nestedItems : track.clips.length;
    const label = createTrackLabel(
      displayTrackName(track),
      kind,
      track.binding.icon,
      `${displayedItems} item${displayedItems === 1 ? "" : "s"}`,
      shownRows * LANE_HEIGHT,
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
    lane.className = `lane track-${kind} track-facet-${track.binding.facet}`;
    lane.style.height = `${shownRows * LANE_HEIGHT}px`;
    for (const clip of track.clips) {
      const from = place(clip.startFrame, snapshot.space.frameCount, zoom.window());
      const to = place(clip.endFrameExclusive, snapshot.space.frameCount, zoom.window());
      if (to <= 0 || from >= 1) continue;
      const row = rowOf.get(clip.id) ?? 0;
      if (folded && row > 0) continue;
      const visibleFrom = Math.max(0, from);
      const visibleTo = Math.min(1, to);
      const node = document.createElement("button");
      node.type = "button";
      node.className = `clip clip-${kind} clip-facet-${track.binding.facet} clip-shape-${clip.presentation.shape}`;
      node.dataset.clip = clip.id;
      node.style.left = `${visibleFrom * 100}%`;
      node.style.width = `${Math.max(0, visibleTo - visibleFrom) * 100}%`;
      const parentId = clip.presentation.parentId;
      if (parentId === undefined) {
        node.style.top = `${row * LANE_HEIGHT}px`;
      } else {
        const siblings = childrenByParent.get(parentId) ?? [];
        const index = Math.max(0, siblings.findIndex((candidate) => candidate.id === clip.id));
        const slot = 34 / Math.max(1, siblings.length);
        node.classList.add("clip-nested-child");
        node.style.top = `${row * LANE_HEIGHT + 9 + index * slot}px`;
        node.style.height = `${Math.max(3, slot - 2)}px`;
      }
      node.title = `${clip.label} · ${clip.startFrame}-${clip.endFrameExclusive}f`;
      node.innerHTML = `<span class="clip-material" aria-hidden="true"></span><span class="clip-phases"></span><span class="clip-copy"><span class="clip-name"></span><span class="clip-meta"></span></span>`;
      const material = node.querySelector<HTMLElement>(".clip-material")!;
      if (clip.preview?.kind === "image") {
        material.classList.add("clip-material-image");
        material.style.backgroundImage = `url(${JSON.stringify(clip.preview.url)})`;
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
      node.querySelector(".clip-name")!.textContent = clip.label;
      node.querySelector(".clip-meta")!.textContent = `${((clip.endFrameExclusive - clip.startFrame) / fps(snapshot)).toFixed(2)}s`;
      node.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        if (clip.interaction.select) store.focus(frameAt(event.clientX), clip.id, "timeline");
      });
      nextClipNodes.push({ node, start: clip.startFrame, end: clip.endFrameExclusive, id: clip.id });
      lane.append(node);
      requestAnimationFrame(() => node.classList.toggle("clip-wide", node.clientWidth >= 110));
    }
    rows.append(lane);
  };

  const build = (snapshot: StudioSnapshot): void => {
    labels.replaceChildren();
    rows.replaceChildren();
    projectionOverlay.replaceChildren();
    projectionKey = "";
    semanticNodes = [];
    const corner = document.createElement("div");
    corner.className = "label-corner";
    corner.textContent = `${snapshot.space.frameCount}f`;
    labels.append(corner);
    buildSemanticLane(snapshot);
    const nextClipNodes: { node: HTMLElement; start: number; end: number; id: string }[] = [];
    for (const track of snapshot.tracks) {
      if (track.binding.family === "speech" && !speechExpanded) continue;
      buildTrack(snapshot, track, nextClipNodes);
    }
    clipNodes = nextClipNodes;
    drawRuler(snapshot);
  };

  const drawProjection = (current: State): void => {
    const nextKey = current.selection.kind === "clip"
      ? `${current.snapshot.revision}:${current.selection.clipId}:${zoom.window().start}:${zoom.window().end}:${lanes.clientWidth}:${lanes.scrollHeight}`
      : `${current.snapshot.revision}:none`;
    if (nextKey === projectionKey) return;
    projectionKey = nextKey;
    projectionOverlay.replaceChildren();
    if (current.selection.kind !== "clip" || semanticLane === undefined) return;
    const clip = store.clip(current.selection.clipId);
    const source = clip?.temporal === undefined ? undefined : sourceWindow(current.snapshot, clip.temporal.source);
    const target = clipNodes.find((item) => item.id === clip?.id)?.node;
    if (source === undefined || target === undefined) return;
    const width = lanes.clientWidth;
    const height = Math.max(lanes.scrollHeight, lanes.clientHeight);
    if (width <= 0 || height <= 0) return;
    projectionOverlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
    projectionOverlay.setAttribute("width", String(width));
    projectionOverlay.setAttribute("height", String(height));
    const lanesBox = lanes.getBoundingClientRect();
    const semanticBox = semanticLane.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const sourceY = semanticBox.bottom - lanesBox.top - 5;
    const targetY = targetBox.top - lanesBox.top + 4;
    if (sourceY < 0 || sourceY > height || targetY < 0 || targetY > height) return;
    const targetWindow = clip?.temporal?.projection ?? {
      startFrame: clip?.startFrame ?? 0,
      endFrameExclusive: clip?.endFrameExclusive ?? 0,
    };
    const endpoints = clip?.temporal?.projection === undefined ? undefined : {
      start: sourceFrame(current.snapshot, clip.temporal.source, "start"),
      end: sourceFrame(current.snapshot, clip.temporal.source, "end"),
    };
    const pairs: readonly (readonly [number, number])[] = source.start === source.end
      ? [[endpoints?.start ?? source.start, targetWindow.startFrame]]
      : [
          [endpoints?.start ?? source.start, targetWindow.startFrame],
          [endpoints?.end ?? source.end, targetWindow.endFrameExclusive],
        ];
    for (const [fromFrame, toFrame] of pairs) {
      const fromX = place(fromFrame, current.snapshot.space.frameCount, zoom.window()) * width;
      const toX = place(toFrame, current.snapshot.space.frameCount, zoom.window()) * width;
      if ((fromX < 0 && toX < 0) || (fromX > width && toX > width)) continue;
      const middle = sourceY + (targetY - sourceY) * 0.48;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "projection-path");
      path.setAttribute("d", `M ${fromX} ${sourceY} C ${fromX} ${middle}, ${toX} ${middle}, ${toX} ${targetY}`);
      projectionOverlay.append(path);
      const sourcePoint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      sourcePoint.setAttribute("class", "projection-point");
      sourcePoint.setAttribute("cx", String(fromX));
      sourcePoint.setAttribute("cy", String(sourceY));
      sourcePoint.setAttribute("r", "2.5");
      projectionOverlay.append(sourcePoint);
    }
  };

  const paint = (): void => {
    if (state === undefined) return;
    const { snapshot, selection, playhead: head } = state;
    const position = place(head.frame, snapshot.space.frameCount, zoom.window()) * lanes.clientWidth;
    playhead.style.transform = `translate3d(${position}px,0,0)`;
    playhead.classList.toggle("outside", position < 0 || position > lanes.clientWidth);
    const rate = Math.max(1, Math.round(fps(snapshot)));
    const seconds = Math.floor(head.frame / fps(snapshot));
    timelineTime.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}:${String(head.frame % rate).padStart(2, "0")}`;
    for (const item of clipNodes) {
      const selected = selection.kind === "clip" && selection.clipId === item.id;
      item.node.classList.toggle("selected", selected);
      item.node.setAttribute("aria-pressed", String(selected));
      item.node.classList.toggle("live", head.frame >= item.start && head.frame < item.end);
    }
    for (const item of semanticNodes) {
      item.node.classList.toggle("live", item.kind === "segment" && head.frame >= item.start && head.frame < item.end);
      item.node.classList.toggle("current", item.kind === "word" && head.frame >= item.start && head.frame < item.end);
    }
    drawProjection(state);
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
    if (state !== undefined) {
      drawRuler(state.snapshot);
      schedulePaint();
    }
  }).observe(lanes);

  return { element };
}
