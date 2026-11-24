import type { NleTimelineScene, NleTimelineSceneTrack } from "@hypit/nle/surface";
import { exactTemporalZero, identityTemporalMap } from "@hypit/temporal/algebra";
import type { NleStudioDropDestination, NleStudioMediaEntry, NleStudioTimelinePreview } from "../protocol.js";

export type TransitionCut = {
  readonly frame: number;
  readonly track: string;
  readonly outgoing: string;
  readonly incoming: string;
  readonly transition?: string;
  readonly endFrame?: number;
};

export type MediaDrop = {
  readonly id: string;
  readonly frame: number;
  readonly snapFrame?: number;
  readonly durationFrames?: number;
  readonly track?: string;
  readonly mediaTarget?: NleStudioDropDestination;
  readonly mediaPosition?: MediaDragPosition;
  readonly item?: string;
  readonly transitionCut?: TransitionCut;
};

export type MediaDragPosition = {
  readonly left: number;
  readonly top: number;
  readonly pixels: number;
  readonly frame: number;
  readonly durationFrames: number;
};

export type MediaPlacementDraft = {
  readonly position: MediaDragPosition;
  readonly role: "picture" | "audio";
  readonly label: string;
  readonly target?: NleStudioDropDestination;
  readonly preview?: NleStudioTimelinePreview;
  readonly shifted?: readonly string[];
  readonly snapFrame?: number;
  readonly blocked?: boolean;
};

export function mediaDragSource(entry: NleStudioMediaEntry): NleStudioTimelinePreview {
  const duration = entry.duration;
  const clock = duration === undefined ? undefined : { duration, sourceTime: identityTemporalMap({ id: "source", duration }) };
  const picture = entry.pictureKind === undefined ? undefined : {
    media: entry.id, displayAspectRatio: entry.displayAspectRatio ?? 1,
    ...(entry.pictureVersion === undefined ? {} : { version: entry.pictureVersion }),
    ...(entry.pictureKind === "signal" ? clock : undefined),
  };
  const audio = (entry.kind === "audio" || entry.kind === "audiovisual") && clock !== undefined ? {
    media: entry.id, ...clock, ...(entry.audioVersion === undefined ? {} : { version: entry.audioVersion }),
  } : undefined;
  return { start: exactTemporalZero(), ...(picture === undefined ? {} : { picture }), ...(audio === undefined ? {} : { audio }) };
}

export function acceptsTimelinePlacement(track: NleTimelineSceneTrack, kind: NleTimelineSceneTrack["kind"],
  role: NleTimelineSceneTrack["role"]): boolean {
  return track.kind === kind && track.role === role && !track.locked;
}

export function trackHasRoom(track: NleTimelineSceneTrack, start: number, duration: number): boolean {
  return track.items.every(clip => start + duration <= clip.startFrame || start >= clip.startFrame + clip.durationFrames);
}

export function transitionCuts(scene: NleTimelineScene): TransitionCut[] {
  const editable = new Map(scene.tracks.filter(track => !track.locked)
    .flatMap(track => track.items.map(item => [item.id, item] as const)));
  return [...scene.transitionCuts, ...scene.transitions.flatMap(transition => {
    const outgoing = editable.get(transition.outgoing);
    const incoming = editable.get(transition.incoming);
    return !outgoing || !incoming ? [] : [{ frame: incoming.startFrame, track: incoming.track,
      endFrame: outgoing.startFrame + outgoing.durationFrames,
      outgoing: outgoing.id, incoming: incoming.id, transition: transition.id }];
  })];
}

export function transitionCutAt(cuts: readonly TransitionCut[], at: number, track: string, radius: number) {
  const onTrack = cuts.filter(cut => cut.track === track);
  return onTrack.find(cut => cut.endFrame !== undefined && at >= cut.frame && at < cut.endFrame)
    ?? onTrack.filter(cut => cut.transition === undefined && Math.abs(cut.frame - at) <= radius)
    .sort((left, right) => Math.abs(left.frame - at) - Math.abs(right.frame - at))[0];
}
