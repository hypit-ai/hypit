import type { HtmlVideoSource } from "@hypit/html-program";
import type { Clock, FrameSpan } from "@hypit/timeline";
import {
  addExactTemporalValues,
  evaluateTemporalMap,
  exactTemporalRational,
  exactTemporalValueFromFrames,
  temporalMapDirectionAt,
} from "@hypit/temporal";
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
  readonly src: string;
  readonly sourceKey: string;
} & (
  | {
      readonly kind: "media";
      readonly streamIndex: number;
      readonly presentationStart: ExactValue;
      readonly sampling: Extract<HtmlVideoSource, { readonly kind: "media" }>["sampling"];
      readonly programClock: Clock;
    }
  | {
      readonly kind: "surface";
      readonly streamIndex: 0;
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
      return {
        kind: "media",
        id: source.id,
        src,
        sourceKey: `${src}\u0000${source.source.streamIndex}`,
        streamIndex: source.source.streamIndex,
        presentationStart: structuredClone(source.source.presentationStart),
        sampling: structuredClone(source.sampling),
        programClock: structuredClone(programClock),
        startFrame: source.startFrame,
        endFrameExclusive: source.endFrameExclusive,
      };
    }
    const src = pathFor(source.resource);
    return {
      kind: "surface",
      id: source.id,
      src,
      sourceKey: `${src}\u00000`,
      streamIndex: 0,
      startFrame: source.startFrame,
      endFrameExclusive: source.endFrameExclusive,
      sourceFrame: { numerator: BigInt(source.sourceFrame.numerator), denominator: BigInt(source.sourceFrame.denominator) },
      sourceRate: { numerator: BigInt(source.sourceRate.numerator), denominator: BigInt(source.sourceRate.denominator) },
      sourceFps: { num: source.sourceFrameRate.numerator, den: source.sourceFrameRate.denominator },
    };
  });
}

function exactSourceTimestampAt(slot: Extract<VideoSlot, { readonly kind: "media" }>, frame: number): Rational | undefined {
  const localFrame = frame - slot.startFrame;
  assert(Number.isSafeInteger(localFrame) && localFrame >= 0, "HTML Program frame lies outside its source occurrence");
  const mapped = evaluateTemporalMap(slot.sampling, exactTemporalValueFromFrames(localFrame, slot.programClock));
  if (mapped === undefined) return undefined;
  return exactTemporalRational(addExactTemporalValues(slot.presentationStart, mapped));
}

export function sourceDirectionAt(slot: Extract<VideoSlot, { readonly kind: "media" }>, frame: number): -1 | 0 | 1 | undefined {
  const localFrame = frame - slot.startFrame;
  assert(Number.isSafeInteger(localFrame) && localFrame >= 0, "HTML Program frame lies outside its source occurrence");
  return temporalMapDirectionAt(slot.sampling, exactTemporalValueFromFrames(localFrame, slot.programClock));
}

export function sourceTimestampAt(slot: Extract<VideoSlot, { readonly kind: "media" }>, frame: number): number | undefined {
  const timestamp = exactSourceTimestampAt(slot, frame);
  if (timestamp === undefined) return undefined;
  const result = Number(timestamp.numerator) / Number(timestamp.denominator);
  assert(Number.isFinite(result), "HTML Program source time exceeds finite arithmetic");
  return result;
}

export function sourceFrameAt(slot: VideoSlot, frame: number, frames?: SourceFrames): number | undefined {
  if (slot.kind === "media") {
    assert(frames !== undefined && frames.timestamps.length > 0,
      `HTML renderer has no timestamp index for source ${slot.sourceKey}`);
    const timestamp = exactSourceTimestampAt(slot, frame);
    if (timestamp === undefined) return undefined;
    const reverse = sourceDirectionAt(slot, frame) === -1;
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
    let source = sources.get(slot.sourceKey);
    if (source === undefined) {
      source = { src: slot.src, streamIndex: slot.streamIndex, windows: [] };
      sources.set(slot.sourceKey, source);
    }
    // A Map may wrap, hold, reverse or contain gaps; endpoint interpolation
    // cannot prove which decoded ordinals the selected Program frames need.
    for (let frame = first; frame <= last; frame++) {
      const sourceFrame = sourceFrameAt(slot, frame, frames.get(slot.sourceKey));
      if (sourceFrame !== undefined) source.windows.push({
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
