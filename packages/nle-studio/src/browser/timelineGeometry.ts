import type { NleTimelineScene, NleTimelineSceneTrack } from "@hypit/nle/view";
import type { NleStudioComponentCatalogEntry } from "../protocol.js";

export const labelWidth = 84, rulerHeight = 30, rowHeight = 62;

export function componentTrackRole(category: NleStudioComponentCatalogEntry["category"]): NleTimelineSceneTrack["role"] {
  return category === "graphic" ? undefined : category;
}

export const emptyTimelineMinZoom = 4, defaultMaxZoom = 4000, timelineEndPadding = 12;

export function rowSize(row: NleTimelineSceneTrack | undefined): number {
  return row?.heightPx ?? rowHeight;
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
