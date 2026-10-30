import type { HtmlArtifactUsage, HtmlVideoSource } from "@hypit/html-program";
import type { Clock, FrameSpan } from "@hypit/timeline";
import {
  addExactTemporalValues,
  createTemporalMapEvaluator,
  exactTemporalRational,
  exactTemporalValueFromFrames,
} from "@hypit/temporal";
import type { TemporalMapEvaluator } from "@hypit/temporal";
import { FrameSpanIndex } from "./frame-span-index.js";
import { assert } from "./process.js";

type ExactValue = ReturnType<typeof addExactTemporalValues>;
type Rational = { readonly numerator: bigint; readonly denominator: bigint };
type SourceFrames = {
  readonly timestamps: readonly bigint[];
  readonly timeBase: { readonly numerator: bigint; readonly denominator: bigint };
};

export type VideoSlot = FrameSpan & {
  readonly id: string;
  readonly elementId: string;
  readonly src: string;
  readonly sourceKey: string;
  readonly usage: HtmlArtifactUsage;
} & (
  | {
      readonly kind: "media";
      readonly streamIndex: number;
      readonly picture: Extract<HtmlVideoSource, { readonly kind: "media" }>["source"]["interpretation"]["picture"];
      readonly codedWidth: number;
      readonly codedHeight: number;
      readonly sampleAspectRatio: { readonly numerator: number; readonly denominator: number };
      readonly rotation: 0 | 90 | 180 | 270;
      readonly presentationStart: ExactValue;
      readonly evaluateSampling: TemporalMapEvaluator;
      readonly programClock: Clock;
    }
  | {
      readonly kind: "surface";
      readonly streamIndex: 0;
      readonly picture: Extract<HtmlVideoSource, { readonly kind: "surface" }>["picture"];
      readonly sourceFrame: Rational;
      readonly sourceRate: Rational;
      readonly sourceFps: { readonly num: number; readonly den: number };
    }
);

export function requestedFrameRanges(range: FrameSpan, frames?: readonly number[]): FrameSpan[] {
  if (frames === undefined) return [{ ...range }];
  const result: FrameSpan[] = [];
  for (const frame of frames) {
    assert(Number.isSafeInteger(frame) && frame >= 0, "HTML Program requested frame is invalid");
    const previous = result.at(-1);
    if (previous !== undefined && previous.endFrameExclusive === frame) {
      result[result.length - 1] = { startFrame: previous.startFrame, endFrameExclusive: frame + 1 };
    } else {
      assert(previous === undefined || previous.endFrameExclusive < frame,
        "HTML Program requested frames must be strictly increasing");
      result.push({ startFrame: frame, endFrameExclusive: frame + 1 });
    }
  }
  assert(result.length > 0, "HTML Program requested frames must not be empty");
  return result;
}

export function videoSlots(
  sources: readonly HtmlVideoSource[],
  pathFor: (resource: string) => string,
  programClock: Clock,
): VideoSlot[] {
  return sources.map((source) => {
    if (source.kind === "media") {
      const src = pathFor(source.source.source.resource);
      const picture = structuredClone(source.source.interpretation.picture);
      return {
        kind: "media",
        id: source.id,
        elementId: source.elementId,
        usage: structuredClone(source.usage),
        src,
        // Two author preparations may select the same container stream with a
        // different resolved picture interpretation. They are distinct decoder
        // inputs even when their bytes and stream index happen to coincide.
        sourceKey: `${src}\u0000${source.source.streamIndex}\u0000${JSON.stringify({
          picture,
          codedWidth: source.source.interpretation.codedWidth,
          codedHeight: source.source.interpretation.codedHeight,
          sampleAspectRatio: source.source.interpretation.sampleAspectRatio,
          rotation: source.source.interpretation.rotationDegrees,
        })}`,
        streamIndex: source.source.streamIndex,
        picture,
        codedWidth: source.source.interpretation.codedWidth,
        codedHeight: source.source.interpretation.codedHeight,
        sampleAspectRatio: { ...source.source.interpretation.sampleAspectRatio },
        rotation: source.source.interpretation.rotationDegrees,
        presentationStart: structuredClone(source.source.presentationStart),
        evaluateSampling: createTemporalMapEvaluator(source.sampling),
        programClock: structuredClone(programClock),
        startFrame: source.startFrame,
        endFrameExclusive: source.endFrameExclusive,
      };
    }
    const src = pathFor(source.artifactId);
    const picture = structuredClone(source.picture);
    return {
      kind: "surface",
      id: source.id,
      elementId: source.elementId,
      usage: structuredClone(source.usage),
      src,
      sourceKey: `${src}\u00000\u0000${JSON.stringify(picture)}`,
      streamIndex: 0,
      picture,
      startFrame: source.startFrame,
      endFrameExclusive: source.endFrameExclusive,
      sourceFrame: { numerator: BigInt(source.sourceFrame.numerator), denominator: BigInt(source.sourceFrame.denominator) },
      sourceRate: { numerator: BigInt(source.sourceRate.numerator), denominator: BigInt(source.sourceRate.denominator) },
      sourceFps: { num: source.sourceFrameRate.numerator, den: source.sourceFrameRate.denominator },
    };
  });
}

function usedAt(usage: HtmlArtifactUsage, frame: number): boolean {
  if (usage.kind === "always") return true;
  if (usage.kind === "never") return false;
  let low = 0;
  let high = usage.spans.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (usage.spans[middle]!.endFrameExclusive <= frame) low = middle + 1;
    else high = middle;
  }
  const span = usage.spans[low];
  return span !== undefined && frame >= span.startFrame;
}

function exactSourceSampleAt(slot: Extract<VideoSlot, { readonly kind: "media" }>, frame: number): {
  readonly timestamp: Rational;
  readonly direction: -1 | 0 | 1;
} | undefined {
  const localFrame = frame - slot.startFrame;
  assert(Number.isSafeInteger(localFrame) && localFrame >= 0, "HTML Program frame lies outside its source occurrence");
  const mapped = slot.evaluateSampling(exactTemporalValueFromFrames(localFrame, slot.programClock), "after");
  if (mapped === undefined) return undefined;
  return {
    timestamp: exactTemporalRational(addExactTemporalValues(slot.presentationStart, mapped.position)),
    direction: mapped.sourceSide === "before" ? -1 : 1,
  };
}

export function sourceFrameAt(slot: VideoSlot, frame: number, frames?: SourceFrames): number | undefined {
  assert(Number.isSafeInteger(frame) && frame >= slot.startFrame && frame < slot.endFrameExclusive,
    "HTML Program frame lies outside its source occurrence");
  if (!usedAt(slot.usage, frame)) return undefined;
  if (slot.kind === "media") {
    assert(frames !== undefined && frames.timestamps.length > 0,
      `HTML renderer has no timestamp index for source ${slot.sourceKey}`);
    const sample = exactSourceSampleAt(slot, frame);
    if (sample === undefined) return undefined;
    const timestamp = sample.timestamp;
    const reverse = sample.direction === -1;
    let low = 0, high = frames.timestamps.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const sourceNumerator = frames.timestamps[middle]! * frames.timeBase.numerator;
      const comparison = sourceNumerator * timestamp.denominator
        - timestamp.numerator * frames.timeBase.denominator;
      if (reverse ? comparison < 0n : comparison <= 0n) low = middle + 1;
      else high = middle;
    }
    return Math.max(0, Math.min(frames.timestamps.length - 1, low - 1));
  }
  const a = slot.sourceFrame;
  const r = slot.sourceRate;
  const numerator = a.numerator * r.denominator
    + BigInt(frame - slot.startFrame) * r.numerator * a.denominator;
  const denominator = a.denominator * r.denominator;
  const value = Number(numerator / denominator
    - (r.numerator < 0n && numerator % denominator === 0n ? 1n : 0n));
  assert(Number.isSafeInteger(value) && value >= 0, "HTML Program source frame exceeds safe arithmetic");
  return value;
}

export function sourceWindows(
  slots: readonly VideoSlot[],
  selection: FrameSpan | readonly FrameSpan[],
  frames: ReadonlyMap<string, SourceFrames>,
  index = new FrameSpanIndex(slots),
) {
  const ranges: readonly FrameSpan[] = Array.isArray(selection) ? selection : [selection as FrameSpan];
  const sources = new Map<string, { src: string; streamIndex: number; windows: FrameSpan[] }>();
  for (const range of ranges) for (const slot of index.overlapping(range)) {
    const first = Math.max(range.startFrame, slot.startFrame);
    const last = Math.min(range.endFrameExclusive, slot.endFrameExclusive) - 1;
    if (last < first) continue;
    // A Map may wrap, hold, reverse or contain gaps; endpoint interpolation
    // cannot prove which decoded ordinals the selected Program frames need.
    for (let frame = first; frame <= last; frame++) {
      const sourceFrame = sourceFrameAt(slot, frame, frames.get(slot.sourceKey));
      if (sourceFrame === undefined) continue;
      let source = sources.get(slot.sourceKey);
      if (source === undefined) {
        source = { src: slot.src, streamIndex: slot.streamIndex, windows: [] };
        sources.set(slot.sourceKey, source);
      }
      source.windows.push({
        startFrame: sourceFrame,
        endFrameExclusive: sourceFrame + 1,
      });
    }
  }
  return [...sources].map(([sourceKey, source]) => {
    const windows: FrameSpan[] = [];
    for (const window of source.windows.sort((a, b) => a.startFrame - b.startFrame)) {
      const previous = windows.at(-1);
      if (previous !== undefined && window.startFrame <= previous.endFrameExclusive) {
        windows[windows.length - 1] = { startFrame: previous.startFrame,
          endFrameExclusive: Math.max(previous.endFrameExclusive, window.endFrameExclusive) };
      } else windows.push(window);
    }
    return { sourceKey, ...source, windows };
  });
}

export function distributeFrameRange(range: FrameSpan, workers: number): FrameSpan[] {
  const count = range.endFrameExclusive - range.startFrame;
  const active = Math.min(count, workers);
  return Array.from({ length: active }, (_, index) => ({
    startFrame: range.startFrame + Math.floor(index * count / active),
    endFrameExclusive: range.startFrame + Math.floor((index + 1) * count / active),
  }));
}
