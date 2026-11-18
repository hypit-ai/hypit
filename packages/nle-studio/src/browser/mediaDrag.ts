import { nleItemEnd } from "@hypit/nle";
import { addExactTemporalValues as add, compareExactTemporalValues as compare, type ExactTemporalValue } from "@hypit/temporal/algebra";
import type { NleTimelineSceneTrack } from "@hypit/nle/view";
import type { NleStudioMediaEntry, NleStudioSession } from "../protocol.js";
import { activeComposition, frameTime } from "./editPlans.js";
import type { TransitionCut } from "./transitionCuts.js";

export type MediaDrop = {
  readonly id: string;
  readonly frame: number;
  readonly track?: string;
  readonly item?: string;
  readonly transitionCut?: TransitionCut;
};

export function mediaFitsTrack(track: NleTimelineSceneTrack, kind: NleStudioMediaEntry["kind"], atFrame: number, durationFrames: number): boolean {
  return mediaTrackCompatible(track, kind)
    && track.items.every(item => atFrame + durationFrames <= item.startFrame || atFrame >= item.startFrame + item.durationFrames);
}

export function mediaTrackCompatible(track: NleTimelineSceneTrack, kind: NleStudioMediaEntry["kind"]): boolean {
  return track.kind === (kind === "audio" ? "audio" : "picture") && !track.locked
    && track.items.every(item => item.role !== "adjust");
}

export function componentFitsTrack(session: NleStudioSession, track: NleTimelineSceneTrack, atFrame: number, duration: ExactTemporalValue): boolean {
  if (!mediaTrackCompatible(track, "picture")) return false;
  const start = frameTime(session, atFrame), end = add(start, duration);
  return activeComposition(session).tracks.find(row => row.id === track.id)?.items.every(item =>
    compare(end, item.start) <= 0 || compare(start, nleItemEnd(item)) >= 0) ?? false;
}
