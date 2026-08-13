/**
 * Provisional timings, for a Source nobody has recorded yet.
 *
 * When a Run Source carries measured timings the preview uses those and this
 * never runs. Otherwise every word still has to land somewhere, so each one is
 * given the time its own syllables would take at an ordinary delivery pace.
 * The identities and the rates are the packages' own - only the arithmetic that
 * spreads words across frames is here, and it is announced as an estimate
 * rather than presented as a measurement.
 */
import {
  countSpeechEstimateUnits, resolveSpeechEstimateLanguage, resolveSpeechEstimateRate,
  sealSpeechEstimatePolicy,
} from "@narratage/estimate";

/** The Narrative a Script sealed, as the preview reads it. */
type Narrative = {
  readonly segments: readonly {
    readonly id: string;
    readonly startAnchorId: string;
    readonly endAnchorId: string;
  }[];
  readonly tokens: readonly {
    readonly id: string;
    readonly segmentId: string;
    readonly startAnchorId: string;
    readonly endAnchorId: string;
    readonly text: string;
  }[];
};

export type EstimatedTiming = {
  readonly map: unknown;
  readonly space: unknown;
  readonly frameCount: number;
};

/**
 * Place every token, then close each Segment around the tokens it holds.
 *
 * Frames are accumulated from a running total rather than summed per token, so
 * rounding cannot drift across a long Script, and every token is given at least
 * one frame: a word that occupies no time cannot be pointed at.
 */
export function estimateTiming(
  narrative: Narrative,
  frameRate: { readonly numerator: number; readonly denominator: number },
): EstimatedTiming {
  const perSecond = frameRate.numerator / frameRate.denominator;
  // Ordinary delivery, with the clamps a whole-utterance estimate would apply
  // turned off: each word is placed on its own here.
  const policy = sealSpeechEstimatePolicy({
    contract: "svml.speech-estimate-policy@1", language: "auto", pace: "normal",
    rounding: "none", minimumSec: 0, maximumSec: Number.MAX_SAFE_INTEGER,
  } as never);
  const spoken = narrative.tokens.map((token) => token.text).join(" ");
  const language = resolveSpeechEstimateLanguage(spoken, "auto" as never);
  const rate = resolveSpeechEstimateRate(policy as never, language);

  const anchors: { identity: string; timeSec: number; frame: number }[] = [];
  // Anchors are how a marker addresses time, but a consumer that reads a window
  // over words - a Caption, say - reads the token ranges, so both are placed.
  const timed: {
    tokenId: string; segmentId: string;
    startSec: number; endSec: number; startFrame: number; endFrame: number;
  }[] = [];
  const at = new Map<string, number>();
  let seconds = 0;
  let frame = 0;
  const place = (identity: string, value: number): void => {
    at.set(identity, value);
    anchors.push({ identity, timeSec: value / perSecond, frame: value });
  };

  const bounds = new Map<string, { first: number; last: number }>();
  for (const token of narrative.tokens) {
    const began = frame;
    place(token.startAnchorId, began);
    const units = countSpeechEstimateUnits(token.text, language);
    // Punctuation carries no syllables and still occupies the frame it is on.
    seconds += Math.max(1 / perSecond, units / rate);
    frame = Math.max(began + 1, Math.round(seconds * perSecond));
    place(token.endAnchorId, frame);
    timed.push({
      tokenId: token.id, segmentId: token.segmentId,
      startSec: began / perSecond, endSec: frame / perSecond,
      startFrame: began, endFrame: frame,
    });
    const held = bounds.get(token.segmentId);
    bounds.set(token.segmentId, { first: held?.first ?? began, last: frame });
  }

  // A Segment opens where its first word does and closes where its last one
  // ends, so a Segment with no words at all still spans nothing rather than
  // spanning the programme.
  for (const segment of narrative.segments) {
    const held = bounds.get(segment.id) ?? { first: frame, last: frame };
    if (!at.has(segment.startAnchorId)) place(segment.startAnchorId, held.first);
    if (!at.has(segment.endAnchorId)) place(segment.endAnchorId, held.last);
  }
  const frameCount = Math.max(1, frame);
  return {
    map: { contract: "svml.complete-semantic-map@1", tokens: timed, anchors },
    space: {
      contract: "svml.program-space@1",
      durationSec: frameCount * frameRate.denominator / frameRate.numerator,
      frameRate: { ...frameRate },
    },
    frameCount,
  };
}
