import { sealVisualTrack } from "@hypit/composition";
import type { VisualTrack } from "@hypit/composition";
import { lowerRestrictedSpeechVisualPresents } from "@hypit/media-track";
import { projectSemanticProgramSpace, semanticTrackSpans } from "@hypit/semantic-track";
import type { SemanticTrack } from "@hypit/semantic-track";
import { assertSpeechTrackSet } from "./program.js";
import type { SpeechTrackSet } from "./types.js";

export function projectSpeechTrackVisual(track: SemanticTrack, set: SpeechTrackSet): VisualTrack {
  assertSpeechTrackSet(set);
  const space = projectSemanticProgramSpace(track);
  const trackId = `${track.id}:visual`;
  const placementBySegment = new Map(set.takes.flatMap((item) => item.visual === undefined
    ? []
    : [[item.semantic.segment.segmentId, item.visual] as const]));
  return sealVisualTrack({
    visualIr: "hypit.visual-ir@1",
    id: trackId,
    presents: lowerRestrictedSpeechVisualPresents(
      trackId,
      space,
      semanticTrackSpans(track).flatMap(({ item, startFrame, endFrameExclusive }) => {
        const visual = item.take.media.visual;
        const placement = placementBySegment.get(item.take.segment.segmentId);
        if (visual === undefined || placement === undefined) return [];
        return [{
          id: item.take.segment.segmentId,
          span: { startFrame, endFrameExclusive },
          artifact: visual.artifact,
          extent: { widthPx: visual.width, heightPx: visual.height },
          frameRate: space.frameRate,
          frameCount: endFrameExclusive - startFrame,
          frame: placement.frame,
          fit: placement.fit,
          stackingOrder: placement.stackingOrder,
        }];
      }),
    ),
  });
}
