import type { NleTimelineScene, NleTimelineSceneTrack } from "@hypit/nle/view";
import type { NleStudioMediaEntry } from "../protocol.js";

export type TransitionCut = {
  readonly frame: number;
  readonly track: string;
  readonly outgoing: string;
  readonly incoming: string;
  readonly transition?: string;
};

export type MediaDrop = {
  readonly id: string;
  readonly frame: number;
  readonly snapFrame?: number;
  readonly track?: string;
  readonly item?: string;
  readonly transitionCut?: TransitionCut;
};

export function mediaTrackCompatible(track: NleTimelineSceneTrack, kind: NleStudioMediaEntry["kind"], role?: NleTimelineSceneTrack["role"]): boolean {
  return track.kind === (kind === "audio" ? "audio" : "picture") && !track.locked && track.role === role;
}

export function transitionCuts(scene: NleTimelineScene): TransitionCut[] {
  return scene.tracks.flatMap(track => {
    if (track.kind !== "picture" || track.locked) return [];
    const items = track.items.filter(item => item.role === "present" && item.enabled);
    const transitions = scene.transitions.flatMap(transition => {
      const incoming = items.find(item => item.id === transition.incoming);
      return incoming === undefined ? [] : [{ frame: incoming.startFrame, track: track.id,
        outgoing: transition.outgoing, incoming: incoming.id, transition: transition.id }];
    });
    const direct = items.flatMap(incoming => {
      const previous = items.filter(item => item.id !== incoming.id && item.startFrame + item.durationFrames === incoming.startFrame);
      return previous.length !== 1 ? [] : [{ frame: incoming.startFrame, track: track.id, outgoing: previous[0]!.id, incoming: incoming.id }];
    });
    return [...transitions, ...direct];
  });
}

export function transitionCutAt(cuts: readonly TransitionCut[], at: number, track: string, radius: number) {
  return cuts.filter(cut => cut.track === track && Math.abs(cut.frame - at) <= radius)
    .sort((left, right) => Math.abs(left.frame - at) - Math.abs(right.frame - at))[0];
}
