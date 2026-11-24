import type { NleTimelineScene, NleTimelineSceneItem, NleTimelineSceneTrack } from "@hypit/nle/surface";

export const labelWidth = 104, rulerHeight = 30, rowHeight = 62;
export const timelineStartPadding = 8, timelineEndPadding = 12;
export const timelineOrigin = labelWidth + timelineStartPadding;
export const timelineSnapPixels = 7;
export const timelineSnapReleasePixels = 11;

export const emptyTimelineMinZoom = 4, defaultMaxZoom = 4000;

export function locateTimelineDrop(viewport: HTMLElement, pointer: { x: number; y: number }, {
  edge,
}: { edge?: "top" | "bottom" | undefined } = {}) {
  const bounds = viewport.getBoundingClientRect();
  const inside = pointer.x >= bounds.left + labelWidth && pointer.x < bounds.right
    && pointer.y >= bounds.top + rulerHeight && pointer.y < bounds.bottom;
  const rows = Array.from(viewport.querySelectorAll<HTMLElement>(".nle-track[data-track-id]"));
  let row: HTMLElement | undefined;
  let gap: number | undefined;
  let nextEdge: typeof edge;
  if (inside) {
    const first = rows[0];
    const last = rows.at(-1);
    const tolerance = 6;
    if (first === undefined || last === undefined) gap = 0;
    else if (pointer.y <= first.getBoundingClientRect().top + (edge === "top" ? 12 : tolerance)) {
      gap = 0;
      nextEdge = "top";
    } else if (pointer.y >= last.getBoundingClientRect().bottom - (edge === "bottom" ? 12 : tolerance)) {
      gap = rows.length;
      nextEdge = "bottom";
    } else {
      const boundary = rows.findIndex(candidate => Math.abs(pointer.y - candidate.getBoundingClientRect().top) <= tolerance);
      if (boundary >= 0) gap = boundary;
      else row = rows.find(candidate => {
        const rect = candidate.getBoundingClientRect();
        return pointer.y >= rect.top && pointer.y < rect.bottom;
      });
    }
  }
  return { inside, bounds, edge: nextEdge, track: gap === undefined ? row?.dataset.trackId : undefined,
    gap: gap === undefined ? undefined : { before: rows[gap]?.dataset.trackId } };
}

export function timelineFrameAt(viewport: HTMLElement, bounds: DOMRect, x: number, pixels: number) {
  return (x - bounds.left - timelineOrigin + viewport.scrollLeft) / pixels;
}

export function rowSize(row: NleTimelineSceneTrack | undefined): number {
  return row === undefined || row.role === "picture" || row.role === "audio" ? rowHeight : 36;
}

export function timelineItemLabel(item: NleTimelineSceneItem, role: NleTimelineSceneTrack["role"]): string {
  if (role !== "text" && role !== "subtitle") return item.display.title;
  if (item.display.text?.trim()) return item.display.text;
  return role === "text" ? "空文字" : "空字幕";
}

export function timelineSnapBoundaries(scene: NleTimelineScene, excluding?: ReadonlySet<string>): number[] {
  return scene.tracks.flatMap(track => track.items
    .filter(item => !excluding?.has(item.id))
    .flatMap(item => [Math.round(item.startFrame), Math.round(item.startFrame + item.durationFrames)]))
    .filter(frame => frame > 0);
}

export type TimelineSnap = {
  readonly frame: number;
  readonly movingEdge: number;
  readonly correction: number;
};

export function snapTimelineEdges(
  edges: readonly number[], playhead: number | undefined, boundaries: readonly number[], pixels: number,
  { held, allows = () => true }: { readonly held?: TimelineSnap | undefined; readonly allows?: (snap: TimelineSnap) => boolean } = {},
): TimelineSnap | undefined {
  const candidate = (frame: number, movingEdge: number, threshold: number) => {
    const edge = edges[movingEdge];
    if (edge === undefined || Math.abs((frame - edge) * pixels) > threshold) return;
    const snap = { frame, movingEdge, correction: frame - edge };
    return allows(snap) ? snap : undefined;
  };
  if (held !== undefined && (held.frame === playhead || boundaries.includes(held.frame))) {
    const retained = candidate(held.frame, held.movingEdge, timelineSnapReleasePixels);
    if (retained !== undefined) return retained;
  }
  const nearest = (targets: readonly number[]) => {
    let best: TimelineSnap | undefined;
    for (const frame of targets) for (let edge = 0; edge < edges.length; edge++) {
      const snap = candidate(frame, edge, timelineSnapPixels);
      if (snap !== undefined && (best === undefined || Math.abs(snap.correction) < Math.abs(best.correction))) best = snap;
    }
    return best;
  };
  return (playhead === undefined ? undefined : nearest([playhead])) ?? nearest(boundaries);
}
