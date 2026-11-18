import type { NleTimelineScene, NleTimelineSceneTrack, NleView } from "@hypit/nle/view";

export const labelWidth = 84, rulerHeight = 30, rowHeight = 62, rowInset = 3;
const mainRowHeight = 86;
export const minZoom = 4, maxZoom = 4000;

/** Compose the stable track heights with Studio's main-track height. */
export function timelineRows(scene: NleTimelineScene, view: NleView, primaryTrack: string | undefined, destinations: ReadonlySet<string>): readonly NleTimelineSceneTrack[] {
  const hasExplicitHeight = view.compositions.find(value => value.composition === scene.composition)?.tracks
    .some(track => track.track === primaryTrack && track.heightPx !== undefined);
  return scene.tracks.filter(track => track.items.length > 0 || destinations.has(track.id)).map(track =>
    track.id === primaryTrack && track.role !== "subtitle" && !hasExplicitHeight ? { ...track, heightPx: mainRowHeight } : track);
}

export function rowSize(row: NleTimelineSceneTrack | undefined): number {
  return row?.heightPx ?? rowHeight;
}
