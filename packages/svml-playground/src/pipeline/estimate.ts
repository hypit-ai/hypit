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
} from "@hypit/estimate";

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
  /**
   * Seconds a Segment's own material declares, when it declares any. A take
   * that says it is eight seconds long will be eight seconds long, so its words
   * belong across those eight seconds rather than across a guess at how fast
   * they might be read.
   */
  declared: ReadonlyMap<string, number> = new Map(),
): EstimatedTiming {
  const perSecond = frameRate.numerator / frameRate.denominator;
  // Ordinary delivery, with the clamps a whole-utterance estimate would apply
  // turned off: each word is placed on its own here.
  const policy = sealSpeechEstimatePolicy({
    language: "auto", pace: "normal",
    rounding: "none", minimumSec: 0, maximumSec: Number.MAX_SAFE_INTEGER,
  } as never);
  const spoken = narrative.tokens.map((token) => token.text).join(" ");
  const language = resolveSpeechEstimateLanguage(spoken, "auto" as never);
  const rate = resolveSpeechEstimateRate(policy as never, language);

  const anchors: { identity: string; frame: number }[] = [];
  // Anchors are how a marker addresses time, but a consumer that reads a window
  // over words - a Caption, say - reads the token ranges, so both are placed.
  const timed: {
    tokenId: string; segmentId: string;
    startFrame: number; endFrameExclusive: number;
  }[] = [];
  const at = new Map<string, number>();
  let seconds = 0;
  let frame = 0;
  const place = (identity: string, value: number): void => {
    at.set(identity, value);
    anchors.push({ identity, frame: value });
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
      startFrame: began, endFrameExclusive: frame,
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
  if (declared.size > 0) {
    return stretched(narrative, frameRate, anchors, timed, declared);
  }
  const frameCount = Math.max(1, frame);
  return {
    map: { tokens: timed, anchors },
    space: {
      durationSec: frameCount * frameRate.denominator / frameRate.numerator,
      frameRate: { ...frameRate },
    },
    frameCount,
  };
}

/**
 * Fit the guess to what the Source already knows.
 *
 * Word durations are a proportion, not a prediction: a syllable model says
 * which word takes longer than which, and nothing about how fast this speaker
 * talks. Where the material declares a length, that length is the truth, so
 * each Segment's words are stretched across it and the Segments laid end to
 * end. What is preserved is the shape of the speech; what is replaced is a
 * pace nobody claimed.
 */
function stretched(
  narrative: Narrative,
  frameRate: { readonly numerator: number; readonly denominator: number },
  anchors: readonly { identity: string; frame: number }[],
  timed: readonly {
    tokenId: string; segmentId: string;
    startFrame: number; endFrameExclusive: number;
  }[],
  declared: ReadonlyMap<string, number>,
): EstimatedTiming {
  const perSecond = frameRate.numerator / frameRate.denominator;
  const guessed = new Map<string, { first: number; last: number }>();
  for (const token of timed) {
    const held = guessed.get(token.segmentId);
    guessed.set(token.segmentId, {
      first: Math.min(held?.first ?? token.startFrame, token.startFrame),
      last: Math.max(held?.last ?? token.endFrameExclusive, token.endFrameExclusive),
    });
  }

  // Each Segment takes the length its material declares, or the length it was
  // guessed at when nothing declares one.
  const span = new Map<string, { from: number; scale: number }>();
  let cursor = 0;
  for (const segment of narrative.segments) {
    const held = guessed.get(segment.id);
    const natural = held === undefined ? 0 : held.last - held.first;
    const wanted = declared.has(segment.id)
      ? Math.max(1, Math.round(declared.get(segment.id)! * perSecond))
      : natural;
    span.set(segment.id, {
      from: cursor,
      scale: natural === 0 ? 0 : wanted / natural,
    });
    cursor += wanted;
  }

  const moved = new Map<string, number>();
  const at = (segmentId: string, frame: number): number => {
    const held = span.get(segmentId);
    const start = guessed.get(segmentId)?.first ?? 0;
    if (held === undefined) return frame;
    return Math.round(held.from + (frame - start) * held.scale);
  };

  const placedTokens = timed.map((token) => {
    const startFrame = at(token.segmentId, token.startFrame);
    const endFrameExclusive = Math.max(startFrame + 1, at(token.segmentId, token.endFrameExclusive));
    moved.set(`${token.tokenId}:start`, startFrame);
    moved.set(`${token.tokenId}:end`, endFrameExclusive);
    return {
      tokenId: token.tokenId, segmentId: token.segmentId,
      startFrame, endFrameExclusive,
    };
  });

  const byToken = new Map(narrative.tokens.map((token) => [token.id, token]));
  const placedAnchors = anchors.map((anchor) => {
    const token = narrative.tokens.find((item) =>
      item.startAnchorId === anchor.identity || item.endAnchorId === anchor.identity);
    if (token !== undefined) {
      const edge = token.startAnchorId === anchor.identity ? "start" : "end";
      const frame = moved.get(`${token.id}:${edge}`) ?? anchor.frame;
      return { identity: anchor.identity, frame };
    }
    // A Segment's own edges close around the words it holds.
    const segment = narrative.segments.find((item) =>
      item.startAnchorId === anchor.identity || item.endAnchorId === anchor.identity);
    if (segment === undefined) return anchor;
    const held = span.get(segment.id);
    const own = placedTokens.filter((item) => item.segmentId === segment.id);
    const frame = segment.startAnchorId === anchor.identity
      ? own[0]?.startFrame ?? held?.from ?? anchor.frame
      : own.at(-1)?.endFrameExclusive ?? held?.from ?? anchor.frame;
    return { identity: anchor.identity, frame };
  });
  void byToken;

  const frameCount = Math.max(1, cursor);
  return {
    map: { tokens: placedTokens, anchors: placedAnchors },
    space: {
      durationSec: frameCount * frameRate.denominator / frameRate.numerator,
      frameRate: { ...frameRate },
    },
    frameCount,
  };
}
