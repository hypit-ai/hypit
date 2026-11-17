import type { NleTimelineSceneTrack } from "@hypit/nle/view";

export const labelWidth = 84, rulerHeight = 30, rowHeight = 62, rowInset = 3;
export const mainRowHeight = 86, compactRowHeight = 36, tracksTop = rulerHeight + 97;
export const minZoom = 4, maxZoom = 4000;

export function rowSize(row: NleTimelineSceneTrack | undefined): number {
  if (row === undefined) return rowHeight;
  return row.heightPx;
}

export function rowOffset(rows: readonly NleTimelineSceneTrack[], index: number): number {
  let top = tracksTop;
  for (let at = 0; at < index; at += 1) top += rowSize(rows[at]);
  return top;
}
