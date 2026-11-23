import type { NleTimelineScene, NleTimelineSceneItem, NleTimelineSceneTrack } from "@hypit/nle/surface";

export const labelWidth = 84, rulerHeight = 30, rowHeight = 62;
export const timelineStartPadding = 8, timelineEndPadding = 12;
export const timelineOrigin = labelWidth + timelineStartPadding;

export const emptyTimelineMinZoom = 4, defaultMaxZoom = 4000;

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

export function snapTimelineEdges(
  edges: readonly number[], playhead: number | undefined, boundaries: readonly number[], pixels: number,
  allows: (correction: number) => boolean = () => true,
): { readonly frame: number; readonly correction: number } | undefined {
  const nearest = (targets: readonly number[]) => {
    let best: { frame: number; correction: number } | undefined;
    for (const frame of targets) for (const edge of edges) {
      const correction = frame - edge;
      if (Math.abs(correction * pixels) <= 7 && allows(correction)
        && (best === undefined || Math.abs(correction) < Math.abs(best.correction))) best = { frame, correction };
    }
    return best;
  };
  return (playhead === undefined ? undefined : nearest([playhead])) ?? nearest(boundaries);
}
