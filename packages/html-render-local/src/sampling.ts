import type { HtmlArtifactUsage, HtmlVideoSource } from "@hypit/html-program";
import type { FrameSpan, TemporalSamplingGrid } from "@hypit/temporal";
import {
  addExactTemporalValues,
  createTemporalMapEvaluator,
  exactTemporalRational,
} from "@hypit/temporal/algebra";
import type { TemporalMapEvaluator } from "@hypit/temporal/algebra";
import { exactTemporalValueFromFrames } from "@hypit/temporal/sampling";
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
  readonly evaluateSampling: TemporalMapEvaluator;
  readonly samplingGrid: TemporalSamplingGrid;
  readonly kind: "media";
  readonly streamIndex: number;
  readonly picture: HtmlVideoSource["source"]["interpretation"]["picture"];
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly sampleAspectRatio: { readonly numerator: number; readonly denominator: number };
  readonly rotation: 0 | 90 | 180 | 270;
  readonly presentationStart: ExactValue;
  readonly reconstruction: HtmlVideoSource["reconstruction"];
};

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
  samplingGrid: TemporalSamplingGrid,
): VideoSlot[] {
  return sources.map((source) => {
    const src = pathFor(source.source.source.resource);
    const picture = structuredClone(source.source.interpretation.picture);
    return {
      kind: "media",
      id: source.id,
      elementId: source.elementId,
      usage: structuredClone(source.usage),
      src,
      // Two preparations may select the same container stream with a different
      // resolved picture interpretation, so they remain distinct decoder inputs.
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
      reconstruction: source.reconstruction === undefined ? undefined : structuredClone(source.reconstruction),
      evaluateSampling: createTemporalMapEvaluator(source.sampling),
      samplingGrid: structuredClone(samplingGrid),
      startFrame: source.startFrame,
      endFrameExclusive: source.endFrameExclusive,
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

function exactSourceSampleAt(slot: VideoSlot, frame: number): {
  readonly timestamp: Rational;
  readonly direction: -1 | 0 | 1;
} | undefined {
  const localFrame = frame - slot.startFrame;
  assert(Number.isSafeInteger(localFrame) && localFrame >= 0, "HTML Program frame lies outside its source occurrence");
  const mapped = slot.evaluateSampling(exactTemporalValueFromFrames(localFrame, slot.samplingGrid), "after");
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
  assert(frames !== undefined && frames.timestamps.length > 0,
    `HTML renderer has no timestamp index for source ${slot.sourceKey}`);
  const sample = exactSourceSampleAt(slot, frame);
  if (sample === undefined) return undefined;
  const timestamp = sample.timestamp;
  if (slot.reconstruction?.kind === "nearest") {
    let low = 0, high = frames.timestamps.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const sourceNumerator = frames.timestamps[middle]! * frames.timeBase.numerator;
      const comparison = sourceNumerator * timestamp.denominator
        - timestamp.numerator * frames.timeBase.denominator;
      if (comparison < 0n) low = middle + 1;
      else high = middle;
    }
    const upper = Math.min(frames.timestamps.length - 1, low);
    const lower = Math.max(0, upper - (low < frames.timestamps.length ? 1 : 0));
    const distance = (ordinal: number): bigint => {
      const sourceNumerator = frames.timestamps[ordinal]! * frames.timeBase.numerator;
      const delta = sourceNumerator * timestamp.denominator
        - timestamp.numerator * frames.timeBase.denominator;
      return delta < 0n ? -delta : delta;
    };
    return distance(lower) <= distance(upper) ? lower : upper;
  }
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
