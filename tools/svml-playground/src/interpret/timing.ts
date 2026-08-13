import {
  countSpeechEstimateUnits,
  resolveSpeechEstimateLanguage,
  resolveSpeechEstimateRate,
  sealSpeechEstimatePolicy,
} from "@narratage/estimate";
import type { SpeechEstimatePolicy } from "@narratage/estimate";
import { sealProgramSpace, programSpaceFrameCount } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";
import type { ParsedNarrative } from "@narratage/script";
import type { CompleteSemanticMap, SemanticTimePoint, TimedSpeechToken } from "@narratage/semantic-map";

export type FrameRate = { readonly numerator: number; readonly denominator: number };

export type Timing = {
  readonly map: CompleteSemanticMap;
  readonly space: ProgramSpace;
};

/**
 * The same delivery-density model the pipeline uses before any generation runs.
 * Bounds are wide because this estimates a whole program token by token rather
 * than one utterance, so per-utterance clamping would distort the timeline.
 */
const POLICY: SpeechEstimatePolicy = sealSpeechEstimatePolicy({
  contract: "svml.speech-estimate-policy@1",
  language: "auto",
  minimumSec: 0,
  maximumSec: 3600,
  rounding: "none",
  pace: "normal",
});

type Window = {
  readonly startSec: number;
  readonly endSec: number;
  readonly startFrame: number;
  readonly endFrame: number;
};

/**
 * Estimate a CompleteSemanticMap from Script text alone.
 *
 * The result is provisional by construction: real cut points move once WhisperX
 * has aligned real audio. It exists so a Source can be read as a timeline before
 * a single Provider has run, and every consumer of this map is labelled
 * "estimated" in the snapshot.
 */
export function estimateTiming(parsed: ParsedNarrative, frameRate: FrameRate): Timing {
  const fps = frameRate.numerator / frameRate.denominator;
  const tokenSeconds: number[] = [];
  for (const segment of parsed.segments) {
    const tokens = parsed.tokens.slice(segment.tokenStart, segment.tokenEndExclusive);
    const language = resolveSpeechEstimateLanguage(
      tokens.map((token) => token.text).join(" "),
      POLICY.language,
    );
    const rate = resolveSpeechEstimateRate(POLICY, language);
    for (const token of tokens) {
      // Punctuation-only tokens count zero units; they still occupy a frame so
      // every anchor stays strictly ordered.
      const units = countSpeechEstimateUnits(token.normalized || token.text, language);
      tokenSeconds.push(Math.max(1 / fps, units / rate));
    }
  }

  // Quantize cumulatively rather than per token, so rounding cannot drift, then
  // force strict monotonicity so no window collapses to zero frames.
  const boundaries: number[] = [0];
  let elapsed = 0;
  for (const seconds of tokenSeconds) {
    elapsed += seconds;
    const previous = boundaries.at(-1)!;
    boundaries.push(Math.max(Math.round(elapsed * fps), previous + 1));
  }

  const frameSec = (frame: number): number => frame * frameRate.denominator / frameRate.numerator;
  const tokenWindow = (index: number): Window => {
    const startFrame = boundaries[index]!;
    const endFrame = boundaries[index + 1]!;
    return { startFrame, endFrame, startSec: frameSec(startFrame), endSec: frameSec(endFrame) };
  };

  const tokenWindows = new Map<string, Window>();
  const tokens: TimedSpeechToken[] = parsed.tokens.map((token, index) => {
    const window = tokenWindow(index);
    tokenWindows.set(token.id, window);
    return { tokenId: token.id, segmentId: token.segmentId, ...window };
  });

  const segmentWindows = new Map<string, Window>();
  for (const segment of parsed.segments) {
    // A Segment with no tokens still needs a non-empty window, or every marker
    // bound to it would project a zero-length span.
    const startFrame = boundaries[segment.tokenStart]!;
    const endFrame = Math.max(boundaries[segment.tokenEndExclusive]!, startFrame + 1);
    segmentWindows.set(segment.id, {
      startFrame, endFrame, startSec: frameSec(startFrame), endSec: frameSec(endFrame),
    });
  }

  const anchors: SemanticTimePoint[] = parsed.semanticIndex.anchors.map((anchor) => {
    const window = anchor.kind === "segment-start" || anchor.kind === "segment-end"
      ? segmentWindows.get(anchor.segmentId)
      : tokenWindows.get(anchor.tokenId!);
    if (window === undefined) throw new Error(`Script anchor ${anchor.id} has no estimated window.`);
    const atStart = anchor.kind === "segment-start" || anchor.kind === "token-start";
    return atStart
      ? { identity: anchor.id, timeSec: window.startSec, frame: window.startFrame }
      : { identity: anchor.id, timeSec: window.endSec, frame: window.endFrame };
  });

  const frameCount = Math.max(1, boundaries.at(-1)!, ...[...segmentWindows.values()].map((w) => w.endFrame));
  const space = sealProgramSpace({
    contract: "svml.program-space@1",
    // Derived from an integer frame count so the exact-boundary check always holds.
    durationSec: frameCount * frameRate.denominator / frameRate.numerator,
    frameRate: { ...frameRate },
  });
  if (programSpaceFrameCount(space) !== frameCount) {
    throw new Error("Estimated ProgramSpace does not round-trip to its frame count.");
  }

  return { map: { contract: "svml.complete-semantic-map@1", tokens, anchors }, space };
}
