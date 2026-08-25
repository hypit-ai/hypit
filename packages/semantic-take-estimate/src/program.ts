import {
  assertSpeechEstimatePolicy,
  countSpeechEstimateUnits,
  resolveSpeechEstimateLanguage,
} from "@hypit/estimate";
import type { SpeechEstimatePolicy } from "@hypit/estimate";
import { verifySynchronizedMedia } from "@hypit/media";
import type { SynchronizedMedia } from "@hypit/media";
import type { Narrative, NarrativeExcerpt } from "@hypit/narrative";
import { materializeSemanticTake } from "@hypit/speech";
import type { SemanticTake, SemanticTakeTimedToken, SemanticTakeTiming } from "@hypit/speech";

const EDGE_GAP_SECONDS = 0.12;
const WORD_GAP_SECONDS = 0.06;

function segmentTokens(narrative: Narrative, excerpt: NarrativeExcerpt): readonly Narrative["tokens"][number][] {
  if (excerpt.kind !== "segment") throw new Error("Estimated SemanticTake requires a Segment excerpt.");
  const segment = narrative.segments.find((candidate) => candidate.id === excerpt.id);
  if (segment === undefined
    || segment.tokenStart !== excerpt.tokenStart
    || segment.tokenEndExclusive !== excerpt.tokenEndExclusive) {
    throw new Error(`NarrativeExcerpt ${excerpt.id} does not describe its authored Segment.`);
  }
  const tokens = narrative.tokens.slice(segment.tokenStart, segment.tokenEndExclusive);
  if (tokens.length === 0) throw new Error(`Estimated SemanticTake Segment ${excerpt.id} contains no speech Tokens.`);
  return tokens;
}

function weightedFrames(total: number, weights: readonly number[]): number[] {
  if (total < weights.length) throw new Error("Estimated SemanticTake has fewer articulation frames than Tokens.");
  const remaining = total - weights.length;
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const allocations = weights.map((weight) => 1 + Math.floor(remaining * weight / weightTotal));
  const left = total - allocations.reduce((sum, value) => sum + value, 0);
  const order = weights
    .map((weight, index) => ({ index, remainder: remaining * weight % weightTotal }))
    .sort((leftItem, rightItem) => rightItem.remainder - leftItem.remainder || leftItem.index - rightItem.index);
  for (let index = 0; index < left; index += 1) allocations[order[index]!.index]! += 1;
  return allocations;
}

/** Deterministic, explicitly estimated timing; it consumes no acoustic evidence. */
export function estimateSemanticTakeTiming(
  narrative: Narrative,
  excerpt: NarrativeExcerpt,
  media: SynchronizedMedia,
  policy: SpeechEstimatePolicy,
): SemanticTakeTiming {
  verifySynchronizedMedia(media);
  assertSpeechEstimatePolicy(policy);
  const tokens = segmentTokens(narrative, excerpt);
  const rate = media.timeline.frameRate.numerator / media.timeline.frameRate.denominator;
  const edgeGap = Math.max(1, Math.round(EDGE_GAP_SECONDS * rate));
  const wordGap = Math.max(1, Math.round(WORD_GAP_SECONDS * rate));
  const reserved = edgeGap * 2 + wordGap * (tokens.length - 1);
  const articulationFrames = media.timeline.frameCount - reserved;
  if (articulationFrames < tokens.length) {
    throw new Error(
      `Estimated SemanticTake needs at least ${reserved + tokens.length} frames to keep every Token visible and separated; got ${media.timeline.frameCount}.`,
    );
  }

  const language = resolveSpeechEstimateLanguage(tokens.map((token) => token.text).join(" "), policy.language);
  const weights = tokens.map((token) => Math.max(1, countSpeechEstimateUnits(token.text, language)));
  const durations = weightedFrames(articulationFrames, weights);
  let cursor = edgeGap;
  const timed = tokens.map((token, index): SemanticTakeTimedToken => {
    const startFrame = cursor;
    const endFrameExclusive = startFrame + durations[index]!;
    cursor = endFrameExclusive + (index === tokens.length - 1 ? 0 : wordGap);
    return {
      tokenId: token.id,
      segmentId: excerpt.id,
      startFrame,
      endFrameExclusive,
    };
  });
  if (cursor !== media.timeline.frameCount - edgeGap) {
    throw new Error("Estimated SemanticTake timing allocation did not close over its frame domain.");
  }

  const segment = narrative.segments.find((candidate) => candidate.id === excerpt.id)!;
  const frameByAnchor = new Map<string, number>([
    [segment.startAnchorId, 0],
    [segment.endAnchorId, media.timeline.frameCount],
  ]);
  for (const [index, token] of tokens.entries()) {
    frameByAnchor.set(token.startAnchorId, timed[index]!.startFrame);
    frameByAnchor.set(token.endAnchorId, timed[index]!.endFrameExclusive);
  }
  const anchors = narrative.semanticIndex.anchors
    .filter((anchor) => anchor.segmentId === excerpt.id)
    .map((anchor) => {
      const frame = frameByAnchor.get(anchor.id);
      if (frame === undefined) throw new Error(`Estimated timing cannot locate authored Anchor ${anchor.id}.`);
      return { identity: anchor.id, frame };
    });
  return { tokens: timed, anchors };
}

export function materializeEstimatedSemanticTake(
  narrative: Narrative,
  excerpt: NarrativeExcerpt,
  media: SynchronizedMedia,
  policy: SpeechEstimatePolicy,
): SemanticTake {
  verifySynchronizedMedia(media);
  if (media.visual === undefined) throw new Error("Estimated SemanticTake requires normalized visual media.");
  return materializeSemanticTake(
    narrative,
    excerpt,
    media,
    estimateSemanticTakeTiming(narrative, excerpt, media, policy),
  );
}
