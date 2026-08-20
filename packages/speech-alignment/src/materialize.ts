import type { Narrative, NarrativeExcerpt } from "@hypit/narrative";
import type { SynchronizedMedia } from "@hypit/media";
import type { SemanticTake } from "@hypit/speech";
import { assertSemanticTakeIdentity, sealSemanticTake } from "@hypit/speech";

import type { LocalSemanticTiming } from "./locate.js";

function authoredSegment(narrative: Narrative, excerpt: NarrativeExcerpt): Narrative["segments"][number] {
  if (excerpt.kind !== "segment") throw new Error("SemanticTake materialization requires a Segment excerpt.");
  const segment = narrative.segments.find((candidate) => candidate.id === excerpt.id);
  if (segment === undefined) throw new Error(`Narrative does not contain Segment ${excerpt.id}.`);
  if (excerpt.tokenStart !== segment.tokenStart || excerpt.tokenEndExclusive !== segment.tokenEndExclusive) {
    throw new Error(`NarrativeExcerpt ${excerpt.id} does not describe its authored Segment.`);
  }
  return segment;
}

function localFrame(frame: number, frameCount: number, label: string): number {
  if (!Number.isSafeInteger(frame) || frame < 0 || frame > frameCount) {
    throw new Error(`${label} lies outside its normalized Segment Take.`);
  }
  return frame;
}

/**
 * Copy one Segment-local alignment into a self-contained semantic Take.
 */
export function materializeSemanticTake(
  narrative: Narrative,
  excerpt: NarrativeExcerpt,
  media: SynchronizedMedia,
  timing: LocalSemanticTiming,
): SemanticTake {
  const segment = authoredSegment(narrative, excerpt);
  const localFrameCount = media.timeline.frameCount;
  const timedById = new Map(timing.tokens.map((token) => [token.tokenId, token]));
  const tokens = narrative.tokens.slice(segment.tokenStart, segment.tokenEndExclusive).map((token) => {
    const timed = timedById.get(token.id);
    if (timed === undefined || timed.segmentId !== segment.id) {
      throw new Error(`Semantic map does not locate authored Token ${token.id}.`);
    }
    return {
      tokenId: token.id,
      segmentId: segment.id,
      text: token.text,
      startAnchorId: token.startAnchorId,
      endAnchorId: token.endAnchorId,
      startFrame: localFrame(timed.startFrame, localFrameCount, `Token ${token.id}`),
      endFrameExclusive: localFrame(timed.endFrameExclusive, localFrameCount, `Token ${token.id}`),
    };
  });
  const anchorsById = new Map(timing.anchors.map((anchor) => [anchor.identity, anchor]));
  const anchors = narrative.semanticIndex.anchors
    .filter((anchor) => anchor.segmentId === segment.id)
    .map((anchor) => {
      const measured = anchorsById.get(anchor.id);
      if (measured === undefined) throw new Error(`Semantic map does not locate authored Anchor ${anchor.id}.`);
      return {
        identity: anchor.id,
        frame: localFrame(measured.frame, localFrameCount, `Anchor ${anchor.id}`),
      };
    });
  const take = sealSemanticTake({
    media,
    segment: {
      segmentId: segment.id,
      startAnchorId: segment.startAnchorId,
      endAnchorId: segment.endAnchorId,
      startFrame: 0,
      endFrameExclusive: media.timeline.frameCount,
    },
    tokens,
    anchors,
  });
  assertSemanticTakeIdentity(take);
  return take;
}
