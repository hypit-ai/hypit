import type { NleTimelineSceneTrack } from "@hypit/nle/view";
import type { NleStudioMediaEntry } from "../protocol.js";

export type MediaDrop = {
  readonly id: string;
  readonly frame: number;
  readonly track?: string;
  readonly item?: string;
};

export function mediaFitsTrack(track: NleTimelineSceneTrack, kind: NleStudioMediaEntry["kind"], atFrame: number, durationFrames: number): boolean {
  return track.kind === (kind === "audio" ? "audio" : "picture") && !track.locked
    && track.items.every(item => item.role !== "adjust"
      && (atFrame + durationFrames <= item.startFrame || atFrame >= item.startFrame + item.durationFrames));
}
