import type { SynchronizedMedia } from "@hypit/media";
import type { Narrative, NarrativeExcerpt } from "@hypit/narrative";

import { assertSemanticTakeIdentity, sealSemanticTake } from "./identity.js";
import type { SemanticTake, SemanticTakeTiming } from "./types.js";

function authoredSegment(narrative: Narrative, excerpt: NarrativeExcerpt): Narrative["segments"][number] {
  if (narrative.id !== excerpt.narrativeId) {
    throw new Error(`NarrativeExcerpt ${excerpt.id} belongs to Narrative ${excerpt.narrativeId}, not ${narrative.id}.`);
  }
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
 * Copy one Segment-local timing result into a self-contained semantic Take.
 * How the timing was obtained remains the caller's explicit package meaning.
 */
export function materializeSemanticTake(
  narrative: Narrative,
  excerpt: NarrativeExcerpt,
  media: SynchronizedMedia,
  timing: SemanticTakeTiming,
): SemanticTake {
  const segment = authoredSegment(narrative, excerpt);
  const localFrameCount = media.timeline.frameCount;
  const timedById = new Map(timing.tokens.map((token) => [token.tokenId, token]));
  const tokens = narrative.tokens.slice(segment.tokenStart, segment.tokenEndExclusive).map((token) => {
    const timed = timedById.get(token.id);
    if (timed === undefined || timed.segmentId !== segment.id) {
      throw new Error(`Semantic timing does not locate authored Token ${token.id}.`);
    }
    const startFrame = localFrame(timed.startFrame, localFrameCount, `Token ${token.id}`);
    const endFrameExclusive = localFrame(timed.endFrameExclusive, localFrameCount, `Token ${token.id}`);
    if (endFrameExclusive <= startFrame) throw new Error(`Token ${token.id} has an empty or reversed frame window.`);
    return {
      tokenId: token.id,
      segmentId: segment.id,
      text: token.text,
      startAnchorId: token.startAnchorId,
      endAnchorId: token.endAnchorId,
      startFrame,
      endFrameExclusive,
    };
  });
  const anchorsById = new Map(timing.anchors.map((anchor) => [anchor.identity, anchor]));
  const anchors = narrative.semanticIndex.anchors
    .filter((anchor) => anchor.segmentId === segment.id)
    .map((anchor) => {
      const measured = anchorsById.get(anchor.id);
      if (measured === undefined) throw new Error(`Semantic timing does not locate authored Anchor ${anchor.id}.`);
      return {
        identity: anchor.id,
        frame: localFrame(measured.frame, localFrameCount, `Anchor ${anchor.id}`),
      };
    });
  const take = sealSemanticTake({
    narrativeId: narrative.id,
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
