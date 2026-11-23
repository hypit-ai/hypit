import type { NleTimelineScene, NleTimelineSceneTrack } from "@hypit/nle/surface";

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
  readonly durationFrames?: number;
  readonly track?: string;
  readonly item?: string;
  readonly transitionCut?: TransitionCut;
};

export function acceptsTimelinePlacement(track: NleTimelineSceneTrack, kind: NleTimelineSceneTrack["kind"],
  role: NleTimelineSceneTrack["role"]): boolean {
  return track.kind === kind && track.role === role && track.enabled && !track.locked;
}

export function trackHasRoom(track: NleTimelineSceneTrack, start: number, duration: number): boolean {
  return track.items.every(clip => start + duration <= clip.startFrame || start >= clip.startFrame + clip.durationFrames);
}

export function transitionCuts(scene: NleTimelineScene): TransitionCut[] {
  return scene.tracks.flatMap(track => {
    if (track.kind !== "picture" || track.locked || !track.enabled) return [];
    const items = track.items.filter(item => item.kind === "present" && item.enabled);
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
