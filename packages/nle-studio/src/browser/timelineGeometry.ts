import type { NleTimelineScene, NleTimelineSceneTrack, NleView } from "@hypit/nle/view";
import type { NleStudioComponentCatalogEntry } from "../protocol.js";

export const labelWidth = 84, rulerHeight = 30, rowHeight = 62, rowInset = 3;
const mainRowHeight = 86;
const compactRowHeight = 36;

export function componentTrackRole(category: NleStudioComponentCatalogEntry["category"]): NleTimelineSceneTrack["role"] {
  return category === "graphic" ? undefined : category;
}

export function inferStudioTrackRole(track: NleTimelineSceneTrack): NleTimelineSceneTrack["role"] {
  if (track.role !== undefined || track.items.length === 0) return track.role;
  if (track.items.every(item => item.role === "adjust")) return "effect";
  if (track.kind === "picture" && track.items.every(item => item.source === "component"
    && item.display.layers.some(layer => layer.kind === "text"))) return "text";
  return undefined;
}

export function studioTrackName(kind: NleTimelineSceneTrack["kind"], role: NleTimelineSceneTrack["role"]): string {
  if (role === "subtitle") return "字幕轨道";
  if (role === "text") return "文字轨道";
  if (role === "effect") return "效果轨道";
  return kind === "audio" ? "音频轨道" : "视频轨道";
}

export const minZoom = 4, maxZoom = 4000;

/** Compose the stable track heights with Studio's main-track height. */
export function timelineRows(scene: NleTimelineScene, view: NleView, primaryTrack: string | undefined, destinations: ReadonlySet<string>): readonly NleTimelineSceneTrack[] {
  const hasExplicitHeight = view.compositions.find(value => value.composition === scene.composition)?.tracks
    .some(track => track.track === primaryTrack && track.heightPx !== undefined);
  return scene.tracks.filter(track => track.items.length > 0 || destinations.has(track.id)).map(track => {
    if (track.role !== undefined) return { ...track, heightPx: compactRowHeight };
    return track.id === primaryTrack && !hasExplicitHeight ? { ...track, heightPx: mainRowHeight } : track;
  });
}

export function rowSize(row: NleTimelineSceneTrack | undefined): number {
  return row?.heightPx ?? rowHeight;
}
