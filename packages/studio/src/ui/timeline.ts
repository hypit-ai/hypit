import type { SemanticAnchor, SemanticToken, StudioSnapshot } from "../shared.js";
import { icon, setIcon } from "./icons.js";
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
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * A cutting-room timeline read straight from the Source: the Speech Track on the
 * bottom track, every Media Item above it on one shared track, exactly as an
 * editor would lay them out.
 */
/** One row of one Track. A Track with overlapping clips is several rows tall. */
const LANE_HEIGHT = 56;
const SEMANTIC_HEIGHT = 96;

/** Tracks the reader has opened. A Track shows only its front row until then. */
const opened = new Set<string>();

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
    <div class="timeline-toolbar">
      <div class="timeline-title">
        ${icon("timeline")}
        <strong>Timeline</strong>
        <span class="timeline-mode"><i></i>Semantic + frame timebase</span>
      </div>
      <div></div>
      <div class="timeline-view-actions">
        <span class="timeline-hint">⌘ scroll to zoom</span>
        <button type="button" class="icon-button" data-zoom-out aria-label="Zoom out" title="Zoom out">
          ${icon("minus")}
        </button>
        <button type="button" class="icon-button" data-zoom-fit aria-label="Fit timeline" title="Fit timeline">
          ${icon("fit")}
        </button>
        <button type="button" class="icon-button" data-zoom-in aria-label="Zoom in" title="Zoom in">
          ${icon("plus")}
        </button>
      </div>
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

  const labels = element.querySelector<HTMLElement>("[data-labels]")!;
  const lanes = element.querySelector<HTMLElement>("[data-lanes]")!;
  // The whole programme as a bar, with the shown part as a window inside it.
  const zoom = createZoom();
  element.querySelector<HTMLElement>("[data-zoom]")!.append(zoom.element);
  element.querySelector<HTMLButtonElement>("[data-zoom-out]")!
    .addEventListener("click", () => zoom.pinch(0.5, 1.45));
  element.querySelector<HTMLButtonElement>("[data-zoom-in]")!
    .addEventListener("click", () => zoom.pinch(0.5, 0.68));
  element.querySelector<HTMLButtonElement>("[data-zoom-fit]")!
    .addEventListener("click", () => zoom.fit());
  // Positions are computed against the window rather than scaled, so a clip's
  // label stays the size it was however far in the reader has zoomed.
  const ruler = element.querySelector<HTMLElement>("[data-ruler]")!;
  const rows = element.querySelector<HTMLElement>("[data-rows]")!;
  const playhead = element.querySelector<HTMLElement>("[data-playhead]")!;

  let state: State | undefined;
  let built = -1;
  let clipNodes: readonly { readonly node: HTMLElement; readonly start: number; readonly end: number; readonly id: string }[] = [];
  let semanticNodes: readonly { readonly node: HTMLElement; readonly start: number; readonly end: number; readonly kind: "segment" | "word" }[] = [];
  let sourceNodes: readonly { readonly node: HTMLElement; readonly id: string; readonly occurrenceId: string }[] = [];
  let paintFrame = 0;

  const fps = (snapshot: StudioSnapshot): number =>
    snapshot.space.frameRate.numerator / snapshot.space.frameRate.denominator;

  const frameAt = (clientX: number): number => {
    const box = lanes.getBoundingClientRect();
    if (box.width === 0 || state === undefined) return 0;
    // Where the pointer is inside the window that is shown, not inside the
    // whole programme; zoomed in, the two are different places.
    const across = (clientX - box.left) / box.width;
    const shown = zoom.window();
    const ratio = shown.start + across * (shown.end - shown.start);
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

  const drawRuler = (snapshot: StudioSnapshot): void => {
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

  const build = (snapshot: StudioSnapshot): void => {
    labels.replaceChildren();
    rows.replaceChildren();
    const nextClipNodes: { node: HTMLElement; start: number; end: number; id: string }[] = [];
    const tones = markerTones(snapshot);

    const corner = document.createElement("div");
    corner.className = "label-corner";
    corner.textContent = `${snapshot.space.frameCount}f`;
    labels.append(corner);

    const nextSemanticNodes: { node: HTMLElement; start: number; end: number; kind: "segment" | "word" }[] = [];
    const nextSourceNodes: { node: HTMLElement; id: string; occurrenceId: string }[] = [];
    const semanticTextNodes: { node: HTMLElement; label: HTMLElement }[] = [];
    if (snapshot.semantic.segments.length > 0) {
      const semanticLabel = document.createElement("div");
      semanticLabel.className = "track-label semantic-label track-visual";
      semanticLabel.style.height = `${SEMANTIC_HEIGHT}px`;
      semanticLabel.innerHTML = `
        <span class="track-icon">${icon("timeline")}</span>
        <span class="track-copy"><strong>Semantic</strong><small></small></span>
        <span class="track-state"></span>`;
      const semanticSource = snapshot.semantic.provenance.candidateId === undefined
        ? "no candidate"
        : `${snapshot.semantic.provenance.origin} candidate`;
      semanticLabel.querySelector("small")!.textContent =
        `${snapshot.semantic.segments.length} segment${snapshot.semantic.segments.length === 1 ? "" : "s"} · ${snapshot.semantic.tokens.length} words · ${snapshot.semantic.provenance.status} · ${semanticSource}`;
      labels.append(semanticLabel);

      const semanticLane = document.createElement("div");
      semanticLane.className = "lane semantic-lane";
      semanticLane.style.height = `${SEMANTIC_HEIGHT}px`;
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

      for (const segment of snapshot.semantic.segments) {
        const from = place(segment.startFrame, snapshot.space.frameCount, zoom.window());
        const to = place(segment.endFrameExclusive, snapshot.space.frameCount, zoom.window());
        if (to <= 0 || from >= 1) continue;
        const visibleFrom = Math.max(0, from);
        const visibleTo = Math.min(1, to);
        const node = document.createElement("div");
        node.className = "semantic-segment";
        node.setAttribute("role", "button");
        node.tabIndex = 0;
        node.dataset.semanticSegment = segment.id;
        node.style.left = `${visibleFrom * 100}%`;
        node.style.width = `${Math.max(0, visibleTo - visibleFrom) * 100}%`;
        node.title = `${segment.id} (${segment.startFrame}-${segment.endFrameExclusive}f) · double-click to focus`;
        const segmentLabel = document.createElement("span");
        segmentLabel.className = "semantic-segment-label";
        segmentLabel.textContent = segment.id;
        node.append(segmentLabel);
        semanticTextNodes.push({ node, label: segmentLabel });
        node.addEventListener("pointerdown", (event) => {
          event.stopPropagation();
          store.seek(segment.startFrame, "timeline");
        });
        node.addEventListener("dblclick", (event) => {
          event.stopPropagation();
          store.seek(segment.startFrame, "timeline");
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
          const segmentVisibleSpan = Math.max(1e-6, visibleTo - visibleFrom);
          const wordVisibleFrom = Math.max(visibleFrom, wordFrom);
          const wordVisibleTo = Math.min(visibleTo, wordTo);
          word.style.left = `${Math.max(0, wordVisibleFrom - visibleFrom) / segmentVisibleSpan * 100}%`;
          word.style.width = `${Math.max(0, wordVisibleTo - wordVisibleFrom) / segmentVisibleSpan * 100}%`;
          word.title = `${token.text} (${token.startFrame}-${token.endFrameExclusive}f)`;
          const wordLabel = document.createElement("span");
          wordLabel.className = "semantic-word-label";
          wordLabel.textContent = token.text;
          word.append(wordLabel);
          semanticTextNodes.push({ node: word, label: wordLabel });
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
          tick.title = `${anchor.kind} · ${anchor.frame}f`;
          node.append(tick);
        }
        semanticLane.append(node);
      }
      for (const selection of snapshot.semantic.selections) {
        const from = place(selection.startFrame, snapshot.space.frameCount, zoom.window());
        const to = place(selection.endFrameExclusive, snapshot.space.frameCount, zoom.window());
        if (to <= 0 || from >= 1) continue;
        const node = document.createElement("span");
        node.className = "semantic-selection-source";
        node.style.left = `${Math.max(0, from) * 100}%`;
        node.style.width = `${Math.max(0, Math.min(1, to) - Math.max(0, from)) * 100}%`;
        node.title = `Selection ${selection.occurrenceId} · ${selection.startFrame}-${selection.endFrameExclusive}f`;
        const tone = tones.get(selection.id);
        if (tone !== undefined) node.classList.add(`tone-${tone}`);
        semanticLane.append(node);
        nextSourceNodes.push({ node, id: selection.id, occurrenceId: selection.occurrenceId });
      }
      for (const moment of snapshot.semantic.moments) {
        const at = place(moment.frame, snapshot.space.frameCount, zoom.window());
        if (at < 0 || at > 1) continue;
        const node = document.createElement("span");
        node.className = "semantic-moment-source";
        node.style.left = `${at * 100}%`;
        node.title = `Moment ${moment.occurrenceId} · ${moment.frame}f`;
        const tone = tones.get(moment.id);
        if (tone !== undefined) node.classList.add(`tone-${tone}`);
        semanticLane.append(node);
        nextSourceNodes.push({ node, id: moment.id, occurrenceId: moment.occurrenceId });
      }
      rows.append(semanticLane);
      // Widths are only meaningful after the lane has entered the document.
      // Hide labels that cannot fit in full; a clipped word remains a useful
      // coloured timing block and never becomes an ugly ellipsis.
      requestAnimationFrame(() => {
        for (const item of semanticTextNodes) {
          item.node.classList.toggle("label-hidden", item.label.scrollWidth > item.label.clientWidth);
          if (!item.node.classList.contains("semantic-segment")) continue;
          // At the whole-programme view a Segment is the useful unit. Once it
          // has enough physical width, its words become a real sub-lane, like a
          // Pattern Clip opening into FL Studio's piano roll.
          item.node.classList.toggle("semantic-coarse", item.node.clientWidth < 88);
        }
      });
    }

    for (const track of snapshot.tracks) {
      const kind = track.binding.family;
      const label = document.createElement("div");
      label.className = `track-label track-${kind}`;
      label.innerHTML = `<span class="track-icon"></span><span class="track-copy"><strong></strong><small></small></span><span class="track-state"></span>`;
      setIcon(label.querySelector(".track-icon")!, track.binding.icon);
      label.querySelector("strong")!.textContent = track.label;
      label.querySelector("small")!.textContent =
        `${track.clips.length} clip${track.clips.length === 1 ? "" : "s"}`;
      label.querySelector(".track-state")!.textContent = "";
      labels.append(label);

      // Clips that overlap in time cannot share a row without hiding each
      // other, so a Track is as many rows tall as it needs. A board's panel
      // runs the whole programme and its rows settle underneath it.
      // Packed by what is in front: the topmost row holds whatever is drawn over
      // everything else, so a folded Track shows the picture the viewer sees.
      const freeFrom: number[] = [];
      const rowOf = new Map<string, number>();
      const roots = track.clips.filter((clip) => clip.presentation.parentId === undefined);
      const childrenByParent = new Map<string, typeof track.clips>();
      for (const clip of track.clips) {
        const parentId = clip.presentation.parentId;
        if (parentId === undefined) continue;
        childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), clip]);
      }
      const ordered = [...roots].sort((a, b) =>
        b.stackOrder - a.stackOrder || a.startFrame - b.startFrame);
      for (const clip of ordered) {
        let row = freeFrom.findIndex((free) => free <= clip.startFrame);
        if (row < 0) { row = freeFrom.length; freeFrom.push(0); }
        freeFrom[row] = clip.endFrameExclusive;
        rowOf.set(clip.id, row);
      }
      // Child entities are drawn inside their registered parent entity. They
      // describe its internal semantic windows and must not manufacture extra
      // Track rows merely because their resolved spans overlap the parent.
      for (const clip of track.clips) {
        const parentId = clip.presentation.parentId;
        if (parentId !== undefined) rowOf.set(clip.id, rowOf.get(parentId) ?? 0);
      }
      const depth = Math.max(1, freeFrom.length);
      const folded = depth > 1 && !opened.has(track.id);
      const shownRows = folded ? 1 : depth;
      label.style.height = `${shownRows * LANE_HEIGHT}px`;
      if (depth > 1) {
        const fold = document.createElement("button");
        fold.type = "button";
        fold.className = "track-fold";
        fold.textContent = folded ? `+${depth - 1}` : "\u2212";
        fold.title = folded ? `Show all ${depth} rows` : "Show only what is in front";
        fold.setAttribute("aria-expanded", String(!folded));
        fold.addEventListener("click", (event) => {
          event.stopPropagation();
          if (opened.has(track.id)) opened.delete(track.id);
          else opened.add(track.id);
          build(snapshot);
          paint();
        });
        label.querySelector("small")!.append(fold);
      }

      const lane = document.createElement("div");
      lane.className = `lane track-${kind}`;
      lane.style.height = `${shownRows * LANE_HEIGHT}px`;
      for (const clip of track.clips) {
        const from = place(clip.startFrame, snapshot.space.frameCount, zoom.window());
        const to = place(clip.endFrameExclusive, snapshot.space.frameCount, zoom.window());
        if (to <= 0 || from >= 1) continue;
        const node = document.createElement("button");
        node.type = "button";
        node.className = `clip clip-${kind} clip-shape-${clip.presentation.shape}`;
        node.dataset.clip = clip.id;
        const visibleFrom = Math.max(0, from);
        const visibleTo = Math.min(1, to);
        node.style.left = `${visibleFrom * 100}%`;
        const row = rowOf.get(clip.id) ?? 0;
        if (folded && row > 0) continue;
        const parentId = clip.presentation.parentId;
        if (parentId === undefined) {
          node.style.top = `${row * LANE_HEIGHT}px`;
        } else {
          const siblings = childrenByParent.get(parentId) ?? [];
          const index = Math.max(0, siblings.findIndex((candidate) => candidate.id === clip.id));
          const slot = 38 / Math.max(1, siblings.length);
          node.classList.add("clip-nested-child");
          node.style.top = `${row * LANE_HEIGHT + 8 + index * slot}px`;
          node.style.height = `${Math.max(3, slot - 2)}px`;
        }
        node.style.width = `${Math.max(0, visibleTo - visibleFrom) * 100}%`;
        node.title = `${clip.label} (${clip.startFrame}-${clip.endFrameExclusive}f)`;
        node.innerHTML = `
          <span class="clip-phases"></span>
          ${clip.interaction.trimStart ? '<span class="clip-edge clip-edge-left"></span>' : ""}
          <span class="clip-copy"><span class="clip-name"></span><span class="clip-meta"></span></span>
          ${clip.interaction.trimEnd ? '<span class="clip-edge clip-edge-right"></span>' : ""}`;
        const projection = clip.temporal?.projection;
        if (projection !== undefined) {
          const projectionFrom = place(projection.startFrame, snapshot.space.frameCount, zoom.window());
          const projectionTo = place(projection.endFrameExclusive, snapshot.space.frameCount, zoom.window());
          if (projectionTo > 0 && projectionFrom < 1) {
            const line = document.createElement("span");
            line.className = "projection-line";
            line.style.left = `${(Math.max(0, projectionFrom) - visibleFrom) / Math.max(1e-6, visibleTo - visibleFrom) * 100}%`;
            line.style.width = `${(Math.min(1, projectionTo) - Math.max(0, projectionFrom)) / Math.max(1e-6, visibleTo - visibleFrom) * 100}%`;
            line.title = `${projection.startExpression} → ${projection.endExpression} · ${projection.startFrame}-${projection.endFrameExclusive}f`;
            node.append(line);
          }
        }
        const phaseLayer = node.querySelector<HTMLElement>(".clip-phases")!;
        for (const phase of clip.temporal?.phases ?? []) {
          if (phase.endFrameExclusive <= clip.startFrame || phase.startFrame >= clip.endFrameExclusive) continue;
          const phaseNode = document.createElement("span");
          phaseNode.className = `clip-phase clip-phase-${phase.role}`;
          phaseNode.style.left = `${(phase.startFrame - clip.startFrame) / Math.max(1, clip.endFrameExclusive - clip.startFrame) * 100}%`;
          phaseNode.style.width = `${(phase.endFrameExclusive - phase.startFrame) / Math.max(1, clip.endFrameExclusive - clip.startFrame) * 100}%`;
          phaseNode.title = `${phase.label} · ${phase.startFrame}-${phase.endFrameExclusive}f`;
          phaseLayer.append(phaseNode);
        }
        node.querySelector(".clip-name")!.textContent = clip.label;
        node.querySelector(".clip-meta")!.textContent =
          `${((clip.endFrameExclusive - clip.startFrame) / fps(snapshot)).toFixed(2)}s`;
        if (from < 0) node.classList.add("clipped-left");
        if (to > 1) node.classList.add("clipped-right");
        // Same tone as the Script marker this clip is named after.
        const tone = tones.get(clip.authoredId);
        if (tone !== undefined) node.classList.add(`tone-${tone}`);
        node.addEventListener("pointerdown", (event) => {
          event.stopPropagation();
          if (!clip.interaction.select) return;
          store.focus(frameAt(event.clientX), clip.id, "timeline");
        });
        nextClipNodes.push({ node, start: clip.startFrame, end: clip.endFrameExclusive, id: clip.id });
        lane.append(node);
        requestAnimationFrame(() => node.classList.toggle("clip-wide", node.clientWidth >= 120));
      }
      rows.append(lane);
    }
    clipNodes = nextClipNodes;
    semanticNodes = nextSemanticNodes;
    sourceNodes = nextSourceNodes;
    drawRuler(snapshot);
  };

  const paint = (): void => {
    if (state === undefined) return;
    const { snapshot, selection, playhead: head } = state;
    const position = place(head.frame, snapshot.space.frameCount, zoom.window()) * lanes.clientWidth;
    playhead.style.transform = `translate3d(${position}px,0,0)`;
    for (const item of clipNodes) {
      item.node.classList.toggle("selected", selection.kind === "clip" && selection.clipId === item.id);
      item.node.setAttribute("aria-pressed", String(selection.kind === "clip" && selection.clipId === item.id));
      item.node.classList.toggle("live", head.frame >= item.start && head.frame < item.end);
    }
    for (const item of semanticNodes) {
      item.node.classList.toggle("live", item.kind === "segment" && head.frame >= item.start && head.frame < item.end);
      item.node.classList.toggle("current", item.kind === "word" && head.frame >= item.start && head.frame < item.end);
    }
    const selectedClip = selection.kind === "clip" ? store.clip(selection.clipId) : undefined;
    for (const item of sourceNodes) {
      const source = selectedClip?.temporal?.source;
      item.node.classList.toggle("linked", source?.id === item.id
        && (source.occurrenceId === undefined || source.occurrenceId === item.occurrenceId));
    }
  };

  const schedulePaint = (): void => {
    if (paintFrame !== 0) return;
    paintFrame = requestAnimationFrame(() => {
      paintFrame = 0;
      paint();
    });
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
    schedulePaint();
  });

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
