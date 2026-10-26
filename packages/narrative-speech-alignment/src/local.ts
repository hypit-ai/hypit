import type { Narrative, NarrativeSegmentRef } from "@hypit/narrative";
import type { NarrativeAlignment } from "@hypit/narrative-temporal";
import type { SpeechTranscriptEvidence } from "@hypit/speech-evidence";
import { resolveTemporalBoundary } from "@hypit/temporal";
import type { LocalTemporalDomain } from "@hypit/temporal";

import { locateAlignedSegmentTiming } from "./locate.js";
import { materializeNarrativeAlignment } from "./materialize.js";
import type { AlignmentBasis } from "./locate.js";

function segmentNarrative(narrative: Narrative, excerpt: NarrativeSegmentRef): Narrative {
  if (excerpt.kind !== "segment") throw new Error("Narrative alignment requires a Segment excerpt.");
  const segment = narrative.segments.find((candidate) => candidate.id === excerpt.id);
  if (segment === undefined) throw new Error(`Narrative does not contain Segment ${excerpt.id}.`);
  if (excerpt.tokenStart !== segment.tokenStart || excerpt.tokenEndExclusive !== segment.tokenEndExclusive) {
    throw new Error(`NarrativeSegmentRef ${excerpt.id} does not describe its authored Segment.`);
  }
  const tokens = narrative.tokens.slice(segment.tokenStart, segment.tokenEndExclusive);
  return {
    id: narrative.id,
    segments: [{ ...segment, tokenStart: 0, tokenEndExclusive: tokens.length }],
    tokens,
    turns: narrative.turns.filter((turn) => turn.segmentId === segment.id).map((turn) => ({ ...turn,
      tokenStart: turn.tokenStart - segment.tokenStart, tokenEndExclusive: turn.tokenEndExclusive - segment.tokenStart })),
    selections: [], moments: [],
    anchors: narrative.anchors.filter((anchor) => anchor.segmentId === segment.id),
  };
}

/** Align one acoustic evidence source locally without turning media into a semantic aggregate. */
export function alignNarrative(
  narrative: Narrative,
  excerpt: NarrativeSegmentRef,
  domain: LocalTemporalDomain,
  evidence: SpeechTranscriptEvidence,
): NarrativeAlignment {
  const localNarrative = segmentNarrative(narrative, excerpt);
  const evidenceClock = { frameRate: { numerator: 16_000, denominator: 1 } };
  const expectedSamples = resolveTemporalBoundary(domain.duration, evidenceClock, "nearest");
  if (evidence.sampleFrames !== expectedSamples) {
    throw new Error("Speech evidence sample span differs from its local temporal domain.");
  }
  const basis: AlignmentBasis = {
    timeBase: { numerator: 1, denominator: 16_000 },
    unitCount: evidence.sampleFrames,
    segments: [{ segmentId: excerpt.id, startUnit: 0, endUnitExclusive: evidence.sampleFrames }],
  };
  const timing = locateAlignedSegmentTiming(localNarrative, basis, evidence);
  return materializeNarrativeAlignment(localNarrative, {
    ...excerpt, tokenStart: 0, tokenEndExclusive: localNarrative.tokens.length,
  }, domain, timing);
}
