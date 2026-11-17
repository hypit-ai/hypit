import type { NleTimelineScene, NleTimelineSceneTrack, NleView } from "@hypit/nle/view";

export const labelWidth = 84, rulerHeight = 30, rowHeight = 62, rowInset = 3;
export const mainRowHeight = 86, compactRowHeight = 36;
export const minZoom = 4, maxZoom = 4000;

function defaultRowHeight(track: NleTimelineSceneTrack, primaryTrack: string | undefined): number {
  const compact = track.items.length > 0 && track.items.every(item => item.role === "adjust"
    || track.kind === "picture" && item.source === "component" && item.display.layers.some(layer => layer.kind === "text"));
  if (compact) return compactRowHeight;
  return track.id === primaryTrack ? mainRowHeight : rowHeight;
}

/** Studio row sizes use explicit View overrides or the compact, regular and main-track defaults. */
export function timelineRows(scene: NleTimelineScene, view: NleView, primaryTrack: string | undefined, destinations: ReadonlySet<string>): readonly NleTimelineSceneTrack[] {
  const state = view.compositions.find(value => value.composition === scene.composition);
  const heights = new Map(state?.tracks.map(track => [track.track, track.heightPx]) ?? []);
  return scene.tracks.filter(track => track.items.length > 0 || destinations.has(track.id)).map(track => ({
    ...track,
    heightPx: heights.get(track.id) ?? defaultRowHeight(track, primaryTrack),
  }));
}

export function rowSize(row: NleTimelineSceneTrack | undefined): number {
  return row?.heightPx ?? rowHeight;
}
