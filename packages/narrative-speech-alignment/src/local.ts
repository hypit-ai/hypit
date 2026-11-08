import type { Narrative, NarrativeSegmentRef } from "@hypit/narrative";
import type { NarrativeAlignment } from "@hypit/narrative-temporal";
import { timedTranscript } from "@hypit/timed-transcript";
import type { TimedTranscript } from "@hypit/timed-transcript";
import { resolveTemporalBoundary } from "@hypit/temporal/sampling";
import type { LocalTemporalDomain } from "@hypit/temporal";

import { locateAlignedSegmentTiming } from "./locate.js";
import { materializeNarrativeAlignment } from "./materialize.js";
import type { AlignmentBasis } from "./locate.js";
import { normalizeForAlignment } from "./normalize.js";
import type { TimedTranscriptCorrectionOptions } from "./types.js";

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
function locateNarrative(
  narrative: Narrative,
  excerpt: NarrativeSegmentRef,
  domain: LocalTemporalDomain,
  transcript: TimedTranscript,
): { readonly narrative: Narrative; readonly timing: ReturnType<typeof locateAlignedSegmentTiming> } {
  const localNarrative = segmentNarrative(narrative, excerpt);
  const evidenceClock = { frameRate: { numerator: 16_000, denominator: 1 } };
  const expectedSamples = resolveTemporalBoundary(domain.duration, evidenceClock, "nearest");
  const basis: AlignmentBasis = {
    timeBase: { numerator: 1, denominator: 16_000 },
    unitCount: expectedSamples,
    segments: [{ segmentId: excerpt.id, startUnit: 0, endUnitExclusive: expectedSamples }],
  };
  const timing = locateAlignedSegmentTiming(localNarrative, basis, transcript);
  return { narrative: localNarrative, timing };
}

/** Align one final transcript locally without turning media into a semantic aggregate. */
export function alignNarrative(
  narrative: Narrative,
  excerpt: NarrativeSegmentRef,
  domain: LocalTemporalDomain,
  transcript: TimedTranscript,
): NarrativeAlignment {
  const located = locateNarrative(narrative, excerpt, domain, transcript);
  return materializeNarrativeAlignment(located.narrative, {
    ...excerpt, tokenStart: 0, tokenEndExclusive: located.narrative.tokens.length,
  }, domain, located.timing);
}

/** Replace recognizer wording with authored wording while retaining one TimedTranscript file shape. */
export function correctTimedTranscript(
  narrative: Narrative,
  excerpt: NarrativeSegmentRef,
  domain: LocalTemporalDomain,
  transcript: TimedTranscript,
  options: TimedTranscriptCorrectionOptions = {},
): TimedTranscript {
  const located = locateNarrative(narrative, excerpt, domain, transcript);
  const byToken = new Map(located.timing.tokens.map((token) => [token.tokenId, token]));
  const seconds = (unit: number): number => unit * located.timing.timeBase.numerator / located.timing.timeBase.denominator;
  const words = located.narrative.tokens.map((token) => {
    const timing = byToken.get(token.id);
    if (timing === undefined) throw new Error(`Transcript correction did not locate Token ${token.id}.`);
    return { word: token.text, start: seconds(timing.startUnit), end: seconds(timing.endUnitExclusive) };
  });
  if (words.length === 0) return timedTranscript(transcript.language, []);
  const fallbackText = words.map((word) => word.word).join(" ");
  const text = options.segmentText ?? fallbackText;
  if (normalizeForAlignment(text) !== normalizeForAlignment(fallbackText)) {
    throw new Error("Corrected transcript segment text disagrees with the authored Narrative tokens.");
  }
  return timedTranscript(transcript.language, [{
    start: words[0]!.start,
    end: words.at(-1)!.end,
    text,
    words,
  }]);
}
