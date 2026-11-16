import { userText, uiAttribute, uiText, uiAttr } from "./i18n.js";
import type { StudioSnapshot } from "../shared.js";
import type { StudioEditHandle } from "@hypit/studio-companion";
import { icon, setIcon } from "./icons.js";
import { mountMaterialPreview } from "./material-preview.js";
import type { State, Store } from "./selection.js";
import { createHandle } from "./resize.js";
import { createZoom } from "./zoom.js";
import { frameTimecode } from "./timecode.js";
import { chooseDomainGesture, domainGestureSpan } from "../temporal-edit.js";
import { applyStudioMutation } from "./writeback.js";

export type Timeline = {
  readonly element: HTMLElement;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly fit: () => void;
};

const itemMetrics = {
  // Ordinary items fill their rows. Temporal-domain lanes may own compact cells.
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
        <button type="button" class="tool-button active" ${uiAttribute("aria-label", "timeline.select")} ${uiAttribute("title", "timeline.select")}>${icon("select")}</button>
      </div>
      <div class="timeline-time" data-timeline-time>00:00:00</div>
      <div class="timeline-view-actions">
        <button type="button" class="icon-button" data-zoom-out ${uiAttribute("aria-label", "timeline.zoom-out")} ${uiAttribute("title", "timeline.zoom-out")}>${icon("minus")}</button>
        <button type="button" class="icon-button" data-zoom-fit ${uiAttribute("aria-label", "timeline.fit-timeline")} ${uiAttribute("title", "timeline.fit-timeline")}>${icon("fit")}</button>
        <button type="button" class="icon-button" data-zoom-in ${uiAttribute("aria-label", "timeline.zoom-in")} ${uiAttribute("title", "timeline.zoom-in")}>${icon("plus")}</button>
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
  uiAttr(labelHandle, "aria-label", "timeline.resize-timeline-track-labels");
  uiAttr(labelHandle, "title", "timeline.resize-track-labels");
  body.insertBefore(labelHandle, lanes);

  let state: State | undefined;
  let built = -1;
  let paintFrame = 0;
  let rebuildFrame = 0;
  let selectedWord: string | undefined;
  let overlapMenu: HTMLElement | undefined;
  const closeOverlapMenu = () => { overlapMenu?.remove(); overlapMenu = undefined; };
  element.addEventListener("pointerdown", event => {
    if (!overlapMenu?.contains(event.target as Node)) closeOverlapMenu();
  });
  element.addEventListener("keydown", event => { if (event.key === "Escape") closeOverlapMenu(); });
  body.addEventListener("scroll", closeOverlapMenu);
  let itemNodes: readonly {
    readonly node: HTMLElement;
    readonly start: number;
    readonly end: number;
    readonly id: string;
    readonly selectionGroup?: string;
  }[] = [];
  let domainNodes: readonly {
    readonly node: HTMLElement;
    readonly companion: string;
    readonly domainId: string;
    readonly id: string;
    readonly start: number;
    readonly end: number;
    readonly kind: "span" | "point";
    readonly appearance: "block" | "compact" | "marker";
  }[] = [];
  const readableWordLabels = new Set<string>();

  const playheadFraction = (): number => {
    if (state === undefined) return 0.5;
    const shown = zoom.window();
    const at = state.playhead.frame / Math.max(1, state.snapshot.timeline.frameCount);
    return Math.max(0, Math.min(1, (at - shown.start) / Math.max(1e-6, shown.end - shown.start)));
  };
  const zoomOut = (): void => zoom.pinch(playheadFraction(), 1.25);
  const zoomIn = (): void => zoom.pinch(playheadFraction(), 0.8);
  const fit = (): void => zoom.fit();
  element.querySelector<HTMLButtonElement>("[data-zoom-out]")!.addEventListener("click", zoomOut);
  element.querySelector<HTMLButtonElement>("[data-zoom-in]")!.addEventListener("click", zoomIn);
  element.querySelector<HTMLButtonElement>("[data-zoom-fit]")!.addEventListener("click", fit);

  const fps = (snapshot: StudioSnapshot): number =>
    snapshot.timeline.frameRate.numerator / snapshot.timeline.frameRate.denominator;

  const snapFrame = (frame: number): number => {
    if (state === undefined || lanes.clientWidth <= 0) return frame;
    const shown = zoom.window();
    const threshold = Math.max(1, Math.ceil(
      (shown.end - shown.start) * state.snapshot.timeline.frameCount / lanes.clientWidth * 6,
    ));
    let nearest = frame;
    let distance = threshold + 1;
    const consider = (candidate: number): void => {
      const next = Math.abs(candidate - frame);
      if (next < distance) { nearest = candidate; distance = next; }
    };
    for (const anchor of state.snapshot.temporalDomains.flatMap((domain) => domain.anchors)) consider(anchor.frame);
    for (const item of state.snapshot.tracks.flatMap((track) => track.items)) {
      consider(item.startFrame);
      consider(item.endFrameExclusive);
    }
    return distance <= threshold ? nearest : frame;
  };

  const rawFrameAt = (clientX: number): number => {
    const box = lanes.getBoundingClientRect();
    if (box.width === 0 || state === undefined) return 0;
    const across = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    const shown = zoom.window();
    return Math.floor(
      (shown.start + across * (shown.end - shown.start)) * state.snapshot.timeline.frameCount,
    );
  };
  const frameAt = (clientX: number): number => snapFrame(rawFrameAt(clientX));

  let pointerArmed = false;
  let pointerDownX = 0;
  let pointerDownOnItem = false;
  let activeEdit: {
    readonly item: StudioSnapshot["tracks"][number]["items"][number];
    readonly handle: StudioEditHandle;
    readonly startFrame: number;
    readonly pointerId: number;
    readonly node: HTMLElement;
    readonly originalLeft: string;
    readonly originalWidth: string;
  } | undefined;

  const editDomain = (snapshot: StudioSnapshot, handle: StudioEditHandle) => handle.domain === undefined
    ? undefined
    : snapshot.temporalDomains.find((domain) => domain.companion === handle.domain!.companion
      && domain.id === handle.domain!.domainId);

  const domainTarget = (edit: NonNullable<typeof activeEdit>, nextFrame: number) =>
    state === undefined ? undefined : chooseDomainGesture({
      anchors: editDomain(state.snapshot, edit.handle)?.anchors ?? [], handle: edit.handle,
      pointerStart: edit.startFrame, pointerNow: nextFrame, frameCount: state.snapshot.timeline.frameCount,
    });

  const absoluteWindowTarget = (
    edit: NonNullable<typeof activeEdit>,
    nextFrame: number,
  ): { readonly startFrame: number; readonly endFrameExclusive: number } => {
    if (state === undefined) return {
      startFrame: edit.item.startFrame,
      endFrameExclusive: edit.item.endFrameExclusive,
    };
    const rawDelta = nextFrame - edit.startFrame;
    const delta = Math.max(-edit.item.startFrame,
      Math.min(state.snapshot.timeline.frameCount - edit.item.endFrameExclusive, rawDelta));
    if (edit.handle.gesture === "move") return {
      startFrame: edit.item.startFrame + delta,
      endFrameExclusive: edit.item.endFrameExclusive + delta,
    };
    if (edit.handle.gesture === "trim-start") return {
      startFrame: Math.min(edit.item.endFrameExclusive - 1, nextFrame),
      endFrameExclusive: edit.item.endFrameExclusive,
    };
    return {
      startFrame: edit.item.startFrame,
      endFrameExclusive: Math.max(edit.item.startFrame + 1, nextFrame),
    };
  };

  const previewWindow = (
    edit: NonNullable<typeof activeEdit>,
    nextFrame: number,
  ): { readonly startFrame: number; readonly endFrameExclusive: number } | undefined => {
    if (state === undefined) return undefined;
    const target = domainTarget(edit, nextFrame);
    if (target !== undefined) return domainGestureSpan(editDomain(state.snapshot, edit.handle)?.anchors ?? [], edit.handle, target);
    if (edit.handle.domain !== undefined) return undefined;
    return edit.handle.temporal === undefined ? undefined : absoluteWindowTarget(edit, nextFrame);
  };
  lanes.addEventListener("pointerdown", (event) => {
    pointerDownOnItem = (event.target as HTMLElement).closest(
      ".studio-item, .temporal-domain-block, .temporal-domain-compact, .temporal-domain-point",
    ) !== null;
    pointerDownX = event.clientX;
    pointerArmed = true;
    // Let temporal-domain children receive their native click. Capturing every
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
    const at = place(frame, state?.snapshot.timeline.frameCount ?? 1, zoom.window()) * lanes.clientWidth;
    hover.style.transform = `translate3d(${at}px,0,0)`;
    hoverTime.textContent = state === undefined ? "" : frameTimecode(frame, state.snapshot.timeline.frameRate);
    hover.classList.add("visible");
    if (activeEdit !== undefined && state !== undefined) {
      const nextFrame = activeEdit.handle.coordinate === "domain-anchor"
        ? rawFrameAt(event.clientX)
        : frameAt(event.clientX);
      const preview = previewWindow(activeEdit, nextFrame);
      if (preview !== undefined) {
        const from = place(preview.startFrame, state.snapshot.timeline.frameCount, zoom.window());
        const to = place(preview.endFrameExclusive, state.snapshot.timeline.frameCount, zoom.window());
        activeEdit.node.style.left = `${from * 100}%`;
        activeEdit.node.style.width = `max(2px, ${Math.max(0, to - from) * 100}%)`;
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
    const nextFrame = edit.handle.coordinate === "domain-anchor"
      ? rawFrameAt(event.clientX)
      : frameAt(event.clientX);
    const resolvedDomainTarget = domainTarget(edit, nextFrame);
    const resolvedWindow = previewWindow(edit, nextFrame);
    if (resolvedWindow === undefined || edit.handle.temporal === undefined) return;
    const target = edit.handle.temporal.kind === "instant"
      ? {
          kind: "instant" as const,
          frame: resolvedWindow.startFrame,
          ...(resolvedDomainTarget === undefined ? {} : { domain: resolvedDomainTarget }),
        }
      : {
          kind: "window" as const,
          ...resolvedWindow,
          ...(resolvedDomainTarget === undefined ? {} : { domain: resolvedDomainTarget }),
        };
    if (resolvedDomainTarget?.kind === "span"
      && edit.handle.domain?.kind === "span"
      && resolvedDomainTarget.startAnchorId === edit.handle.domain.startAnchorId
      && resolvedDomainTarget.endAnchorId === edit.handle.domain.endAnchorId
      && (target.kind === "instant"
        ? target.frame === edit.item.startFrame
        : target.startFrame === edit.item.startFrame && target.endFrameExclusive === edit.item.endFrameExclusive)) return;
    if (resolvedDomainTarget?.kind === "point"
      && edit.handle.domain?.kind === "point"
      && resolvedDomainTarget.anchorId === edit.handle.domain.anchorId
      && (target.kind === "instant"
        ? target.frame === edit.item.startFrame
        : target.startFrame === edit.item.startFrame && target.endFrameExclusive === edit.item.endFrameExclusive)) return;
    if (resolvedDomainTarget === undefined
      && (target.kind === "instant"
        ? target.frame === edit.item.startFrame
        : target.startFrame === edit.item.startFrame && target.endFrameExclusive === edit.item.endFrameExclusive)) return;
    element.dispatchEvent(new CustomEvent("studio:write", { detail: { state: "saving" } }));
    void applyStudioMutation({
      type: "timeline.adjust",
      revision: state.snapshot.revision,
      itemId: edit.item.id,
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
    const frameCount = Math.max(1, snapshot.timeline.frameCount);
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
    const lastSecond = Math.min(Math.floor(snapshot.timeline.durationSec), Math.floor(endSecond + 1e-6));
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
    label.innerHTML = `${attached
      ? '<span class="track-attachment-mark" aria-hidden="true"></span>'
      : '<span class="track-icon"></span>'}<span class="track-copy"><strong></strong></span>`;
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


  const buildTemporalDomainLane = (
    snapshot: StudioSnapshot,
    domain: StudioSnapshot["temporalDomains"][number],
    group: HTMLElement,
    insetTop: number,
    insetBottom: number,
  ): void => {
    if (domain.lanes.length === 0) return;
    const laneHeight = domain.lanes.reduce((height, lane) => height + lane.heightPx, insetTop + insetBottom);
    const lane = document.createElement("div");
    lane.className = `lane temporal-domain-lane track-tone-${domain.presentation.tone}`;
    lane.style.height = `${laneHeight}px`;
    const bands = new Map<string, HTMLElement>();
    let bandTop = insetTop;
    for (const description of domain.lanes) {
      const band = document.createElement("div");
      band.className = "temporal-domain-band";
      band.style.top = `${bandTop}px`;
      band.style.setProperty("--temporal-domain-band-height", `${description.heightPx}px`);
      band.setAttribute("aria-label", description.label ?? description.id);
      bands.set(description.id, band);
      lane.append(band);
      bandTop += description.heightPx;
    }
    const nextNodes: typeof domainNodes[number][] = [];
    for (const item of domain.items) {
      const band = bands.get(item.laneId);
      if (band === undefined) continue;
      const start = item.kind === "point" ? item.frame : item.startFrame;
      const end = item.kind === "point" ? item.frame + 1 : item.endFrameExclusive;
      const from = place(start, snapshot.timeline.frameCount, zoom.window());
      const to = place(end, snapshot.timeline.frameCount, zoom.window());
      if (to <= 0 || from >= 1) continue;
      const node = item.appearance === "compact" ? document.createElement("span") : document.createElement("button");
      if (node instanceof HTMLButtonElement) node.type = "button";
      node.className = item.kind === "point" ? "temporal-domain-point"
        : item.appearance === "compact" ? "temporal-domain-cell temporal-domain-compact"
        : "temporal-domain-cell temporal-domain-block";
      node.style.left = `${from * 100}%`;
      if (item.kind === "span") node.style.width = `max(${item.appearance === "compact" ? 1 : 2}px, ${Math.max(0, to - from) * 100}%)`;
      node.title = item.label;
      node.setAttribute("aria-label", item.label);
      if (item.kind === "span") {
        const content = document.createElement("span");
        content.className = "temporal-domain-cell-content";
        const text = document.createElement("span");
        text.className = item.appearance === "compact" ? "temporal-domain-compact-label" : "temporal-domain-block-label";
        text.textContent = item.label;
        content.append(text);
        node.append(content);
        if (item.appearance === "compact") {
          const widthPx = Math.max(1, (to - from) * lanes.clientWidth);
          const textWidthPx = measuredText(item.label);
          const identity = `${domain.companion}:${domain.id}:${item.id}`;
          const fitsCell = widthPx - wordLabelPaddingPx * 2 >= textWidthPx
            + (readableWordLabels.has(identity) ? 0 : wordLabelEnterBufferPx);
          if (fitsCell) readableWordLabels.add(identity);
          else readableWordLabels.delete(identity);
          const fitsViewport = from >= 0
            && from * lanes.clientWidth + wordLabelPaddingPx * 2 + textWidthPx <= lanes.clientWidth;
          node.classList.toggle("word-label-visible", fitsCell && fitsViewport);
        }
      }
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        if (item.appearance === "compact") {
          store.clearSelection();
          selectedWord = `${domain.companion}:${domain.id}:${item.id}`;
        } else {
          store.selectTemporalDomainItem(domain.companion, domain.id, item.id, "timeline");
        }
        store.seek(start, "timeline");
      });
      if (item.kind === "span" && item.appearance !== "compact") node.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        zoom.focus(item.startFrame / Math.max(1, snapshot.timeline.frameCount),
          item.endFrameExclusive / Math.max(1, snapshot.timeline.frameCount));
      });
      band.append(node);
      nextNodes.push({ node, companion: domain.companion, domainId: domain.id, id: item.id,
        start, end, kind: item.kind, appearance: item.appearance });
    }
    lane.addEventListener("contextmenu", (event) => {
      const hits = nextNodes.filter(({ node }) => {
        const rect = node.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX < rect.right
          && event.clientY >= rect.top && event.clientY < rect.bottom;
      });
      if (hits.length < 2) return;
      event.preventDefault();
      closeOverlapMenu();
      const menu = document.createElement("div");
      menu.className = "timeline-overlap-menu";
      menu.setAttribute("role", "menu");
      uiAttr(menu, "aria-label", "timeline.overlapping-timeline-objects");
      for (const hit of [...hits].reverse()) {
        const option = document.createElement("button");
        option.type = "button";
        option.setAttribute("role", "menuitem");
        option.textContent = hit.node.getAttribute("aria-label") ?? hit.id;
        option.addEventListener("click", () => { closeOverlapMenu(); hit.node.click(); });
        menu.append(option);
      }
      element.append(menu);
      menu.style.left = `${Math.max(0, Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(0, Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8))}px`;
      overlapMenu = menu;
      menu.querySelector("button")?.focus();
    });
    group.append(lane);
    domainNodes = [...domainNodes, ...nextNodes];
  };

  const buildTrack = (
    snapshot: StudioSnapshot,
    track: StudioSnapshot["tracks"][number],
    nextItemNodes: { node: HTMLElement; start: number; end: number; id: string; selectionGroup?: string }[],
    attached = false,
  ): void => {
    const totalHeight = track.binding.lane.heightPx;
    const tone = track.binding.tone;
    const displayedItems = track.items.length;
    const label = createTrackLabel(
      displayTrackName(track),
      tone,
      track.binding.icon,
      `${displayedItems} item${displayedItems === 1 ? "" : "s"}`,
      totalHeight,
      attached,
    );
    label.classList.add(`track-facet-${track.binding.facet}`);
    labels.append(label);

    const trackBody = document.createElement("div");
    trackBody.className = "timeline-track";
    trackBody.dataset.track = track.id;
    trackBody.style.height = `${totalHeight}px`;
    const materialMounts: {
      readonly target: HTMLElement;
      readonly preview: Extract<StudioSnapshot["tracks"][number]["items"][number]["display"]["layers"][number], { readonly kind: "preview" }>["preview"];
    }[] = [];
    const lane = document.createElement("div");
    lane.className = `lane track-tone-${tone} track-facet-${track.binding.facet}${attached ? " lane-attached" : ""}`;
    lane.style.height = `${totalHeight}px`;
    lane.style.setProperty("--lane-height", `${totalHeight}px`);
    const laneWidth = lanes.clientWidth;
    // Stable order preserves Companion projection order when stack levels tie.
    for (const item of [...track.items].sort((a, b) => a.stackOrder - b.stackOrder)) {
        const from = place(item.startFrame, snapshot.timeline.frameCount, zoom.window());
        const to = place(item.endFrameExclusive, snapshot.timeline.frameCount, zoom.window());
        if (to <= 0 || from >= 1) continue;
        const node = document.createElement("button");
        node.type = "button";
        node.className = `studio-item studio-item-tone-${tone} studio-item-facet-${track.binding.facet} studio-item-chrome-${item.presentation.chrome}`;
        node.classList.toggle("studio-item-editable", item.editHandles.some((handle) => handle.enabled));
        node.dataset.item = item.id;
        node.setAttribute("aria-label", item.display.title);
        node.style.left = `${from * 100}%`;
        node.style.width = `max(2px, ${Math.max(0, to - from) * 100}%)`;
        const visibleWidthPx = visibleItemWidth(from, to, laneWidth);
        node.classList.toggle("studio-item-preview-wide", visibleWidthPx >= 92);
        node.title = `${item.display.title} · ${item.startFrame}-${item.endFrameExclusive}f`;
        node.innerHTML = `<span class="studio-item-head"><span class="studio-item-name"></span><span class="studio-item-meta"></span></span><span class="studio-item-body"><span class="studio-item-layers" aria-hidden="true"></span></span><span class="studio-item-boundary" aria-hidden="true"></span><span class="studio-item-selection" aria-hidden="true"></span>`;
        const layers = node.querySelector<HTMLElement>(".studio-item-layers")!;
        item.display.layers.forEach((layer, index) => {
          const layerNode = document.createElement("span");
          layerNode.className = `studio-item-layer studio-item-layer-${layer.kind} studio-item-layer-role-${layer.role}`;
          layerNode.style.zIndex = String(index + 1);
          if (layer.kind === "text") {
            layerNode.textContent = layer.text;
          } else {
            layerNode.classList.add(`studio-item-layer-layout-${layer.layout}`);
            materialMounts.push({ target: layerNode, preview: layer.preview });
          }
          layers.append(layerNode);
        });
        const metaText = item.presentation.chrome === "point"
          ? `${(item.startFrame / fps(snapshot)).toFixed(2)}s`
          : `${((item.endFrameExclusive - item.startFrame) / fps(snapshot)).toFixed(2)}s`;
        const headerLabel = node.querySelector<HTMLElement>(".studio-item-name")!;
        node.querySelector(".studio-item-meta")!.textContent = metaText;
        headerLabel.textContent = item.display.title;
        node.addEventListener("pointerdown", (event) => {
          const rect = node.getBoundingClientRect();
          const edge = Math.min(8, Math.max(4, rect.width / 3));
          const nearStart = event.clientX - rect.left <= edge;
          const nearEnd = rect.right - event.clientX <= edge;
          const handle = item.editHandles.find((candidate) =>
            candidate.enabled
            && ((candidate.gesture === "trim-start" && nearStart)
              || (candidate.gesture === "trim-end" && nearEnd)
              || (candidate.gesture === "move" && !nearStart && !nearEnd)));
          if (handle !== undefined
            && (handle.gesture === "move" || handle.gesture === "trim-start" || handle.gesture === "trim-end")) {
            event.stopPropagation();
            const pointerFrame = handle.coordinate === "domain-anchor"
              ? rawFrameAt(event.clientX)
              : frameAt(event.clientX);
            activeEdit = {
              item,
              handle,
              startFrame: pointerFrame,
              pointerId: event.pointerId,
              node,
              originalLeft: node.style.left,
              originalWidth: node.style.width,
            };
            node.classList.add("editing");
            try { lanes.setPointerCapture(event.pointerId); } catch { /* local pointer */ }
            store.select(item.id, "timeline");
            return;
          }
          store.select(item.id, "timeline");
        });
        node.addEventListener("dblclick", () => store.seek(item.startFrame, "timeline"));
        nextItemNodes.push({ node, start: item.startFrame, end: item.endFrameExclusive, id: item.id, ...(item.selectionGroup === undefined ? {} : { selectionGroup: item.selectionGroup }) });
      lane.append(node);
    }
    trackBody.append(lane);
    rows.append(trackBody);
    // Cached storyboards render synchronously and need connected, measurable targets.
    for (const item of materialMounts) mountMaterialPreview(item.target, item.preview);
  };

  const build = (snapshot: StudioSnapshot): void => {
    closeOverlapMenu();
    const scrollTop = body.scrollTop;
    labels.replaceChildren();
    rows.replaceChildren();
    domainNodes = [];
    const temporalDomains = snapshot.temporalDomains.filter((domain) => domain.lanes.length > 0);
    if (temporalDomains.length > 0) {
      const temporalHeight = temporalDomains.reduce((height, domain) => height
        + domain.lanes.reduce((domainHeight, lane) => domainHeight + lane.heightPx, 0), itemMetrics.insetYPx * 2);
      const temporalLabel = createTrackLabel("", "teal", "brand", "", temporalHeight);
      userText(temporalLabel.querySelector("strong")!, "Timeline");
      temporalLabel.title = `${temporalDomains.reduce((count, domain) => count + domain.items.length, 0)} temporal items`;
      temporalLabel.classList.add("track-label-temporal-domain");
      temporalLabel.style.height = `calc(var(--timeline-ruler-height) + ${temporalHeight}px)`;
      labels.append(temporalLabel);
    } else {
      const corner = document.createElement("div");
      corner.className = "label-corner";
      userText(corner, "");
      labels.append(corner);
    }
    if (temporalDomains.length > 0) {
      const group = document.createElement("div");
      group.className = "temporal-domain-group";
      temporalDomains.forEach((domain, index) => buildTemporalDomainLane(
        snapshot,
        domain,
        group,
        index === 0 ? itemMetrics.insetYPx : 0,
        index === temporalDomains.length - 1 ? itemMetrics.insetYPx : 0,
      ));
      rows.append(group);
    }
    const nextItemNodes: { node: HTMLElement; start: number; end: number; id: string; selectionGroup?: string }[] = [];
    for (const track of snapshot.tracks) {
      const attachedTo = track.binding.lane.attachedTo;
      if (attachedTo !== undefined) continue;
      buildTrack(snapshot, track, nextItemNodes);
      const slot = track.binding.lane.groupId ?? track.binding.groupId;
      const attachments = attachedTracks(snapshot, slot, track.binding.groupId);
      for (const attachment of attachments) {
        buildTrack(snapshot, attachment, nextItemNodes, true);
      }
    }
    itemNodes = nextItemNodes;
    drawRuler(snapshot);
    // Replacing every row briefly collapses the scroll surface. Preserve the
    // vertical reading position when a horizontal pan rebuilds the window.
    body.scrollTop = scrollTop;
  };

  const paint = (): void => {
    if (state === undefined) return;
    const { snapshot, selection, playhead: head } = state;
    const position = place(head.frame, snapshot.timeline.frameCount, zoom.window()) * lanes.clientWidth;
    if (head.origin === "play" && position > lanes.clientWidth * 0.88 && zoom.window().end < 0.9999) {
      zoom.slide(Math.max(0.25, position / Math.max(1, lanes.clientWidth) - 0.18));
      return;
    }
    playhead.style.transform = `translate3d(${position}px,0,0)`;
    playheadGrip.style.transform = `translate3d(${position - 5}px,0,0)`;
    playhead.classList.toggle("outside", position < 0 || position > lanes.clientWidth);
    playheadGrip.classList.toggle("outside", position < 0 || position > lanes.clientWidth);
    timelineTime.textContent = frameTimecode(head.frame, snapshot.timeline.frameRate);
    const chosen = selection.kind === "item" ? store.item(selection.itemId) : undefined;
    for (const item of itemNodes) {
      const selected = chosen !== undefined && (chosen.id === item.id
        || (chosen.selectionGroup !== undefined && chosen.selectionGroup === item.selectionGroup));
      item.node.classList.toggle("selected", selected);
      item.node.setAttribute("aria-pressed", String(selected));
      item.node.classList.toggle("live", head.frame >= item.start && head.frame < item.end);
    }
    for (const item of domainNodes) {
      const inside = item.kind === "span" && head.frame >= item.start && head.frame < item.end;
      item.node.classList.toggle("live", inside && item.appearance !== "compact");
      item.node.classList.toggle("current", inside && item.appearance === "compact");
      const identity = `${item.companion}:${item.domainId}:${item.id}`;
      const selected = (item.appearance === "compact" && selectedWord === identity && selection.kind === "none")
        || (selection.kind === "temporal-domain" && selection.companion === item.companion
          && selection.domainId === item.domainId && selection.itemId === item.id);
      item.node.classList.toggle("selected", selected);
      if (item.appearance !== "compact") item.node.setAttribute("aria-pressed", String(selected));
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
    if (value.selection.kind !== "none") selectedWord = undefined;
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
