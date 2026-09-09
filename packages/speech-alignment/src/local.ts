import type { SynchronizedMedia } from "@hypit/media";
import type { Narrative, NarrativeExcerpt } from "@hypit/narrative";
import { sealProgramSpace } from "@hypit/program-space";
import { materializeSemanticTake } from "@hypit/speech";
import type { SemanticTake } from "@hypit/speech";
import type { AlignedTranscriptEvidence } from "@hypit/speech-evidence";

import { locateAlignedSegmentTiming } from "./locate.js";
import type { AlignmentBasis } from "./locate.js";

function segmentNarrative(narrative: Narrative, excerpt: NarrativeExcerpt): Narrative {
  if (excerpt.kind !== "segment") throw new Error("SemanticTake alignment requires a Segment excerpt.");
  const segment = narrative.segments.find((candidate) => candidate.id === excerpt.id);
  if (segment === undefined) throw new Error(`Narrative does not contain Segment ${excerpt.id}.`);
  if (excerpt.tokenStart !== segment.tokenStart || excerpt.tokenEndExclusive !== segment.tokenEndExclusive) {
    throw new Error(`NarrativeExcerpt ${excerpt.id} does not describe its authored Segment.`);
  }
  const tokens = narrative.tokens.slice(segment.tokenStart, segment.tokenEndExclusive);
  return {
    id: narrative.id,
    segments: [{ ...segment, tokenStart: 0, tokenEndExclusive: tokens.length }],
    tokens,
    turns: narrative.turns
      .filter((turn) => turn.segmentId === segment.id)
      .map((turn) => ({
        ...turn,
        tokenStart: turn.tokenStart - segment.tokenStart,
        tokenEndExclusive: turn.tokenEndExclusive - segment.tokenStart,
      })),
    selections: [],
    moments: [],
    semanticIndex: {
      anchors: narrative.semanticIndex.anchors.filter((anchor) => anchor.segmentId === segment.id),
    },
  };
}

/** Align one normalized Take independently, then materialize its local semantic product. */
export function alignSemanticTake(
  narrative: Narrative,
  excerpt: NarrativeExcerpt,
  media: SynchronizedMedia,
  evidence: AlignedTranscriptEvidence,
): SemanticTake {
  if (media.audio === undefined) throw new Error(`SemanticTake ${excerpt.id} has no normalized audio.`);
  const localNarrative = segmentNarrative(narrative, excerpt);
  const programSpace = sealProgramSpace({
    id: `${excerpt.narrativeId}.segment.${excerpt.id}`,
    durationSec: media.timeline.frameCount * media.timeline.frameRate.denominator
      / media.timeline.frameRate.numerator,
    frameRate: media.timeline.frameRate,
  });
  const basis: AlignmentBasis = {
    programSpace,
    audio: media.audio.artifact,
    segments: [{ segmentId: excerpt.id, startFrame: 0, endFrameExclusive: media.timeline.frameCount }],
  };
  const timing = locateAlignedSegmentTiming(localNarrative, basis, evidence);
  return materializeSemanticTake(localNarrative, {
    ...excerpt,
    tokenStart: 0,
    tokenEndExclusive: localNarrative.tokens.length,
  }, media, timing);
}
