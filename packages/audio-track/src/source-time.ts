import type {
  AudioSourceTimeMap,
  AudioSourceTimePiece,
  AudioSourceTimeRational,
} from "@hypit/composition";
import { temporalDurationInSamples } from "@hypit/temporal";
import type { Timeline } from "@hypit/timeline";

import type {
  AudioSourceTimeBounds,
  AudioSourceTimePoint,
  AudioSourceTimeRelation,
  AudioSourceTimeSpec,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function rational(numerator: bigint, denominator = 1n): AudioSourceTimeRational {
  assert(denominator > 0n, "Audio source-time rational is invalid.");
  const divisor = gcd(numerator, denominator);
  const n = numerator / divisor;
  const d = denominator / divisor;
  assert(n <= BigInt(Number.MAX_SAFE_INTEGER) && d <= BigInt(Number.MAX_SAFE_INTEGER),
    "Audio source-time rational exceeds safe wire arithmetic.");
  return { numerator: Number(n), denominator: Number(d) };
}

const ZERO = { unit: "frames", value: 0 } as const;
const START: AudioSourceTimePoint = { edge: "start", offset: ZERO };
const END: AudioSourceTimePoint = { edge: "end", offset: ZERO };
const FULL: AudioSourceTimeBounds = { from: START, until: END };

export function defaultAudioSourceTimeSpec(): AudioSourceTimeSpec {
  return { relations: [{
    kind: "rate",
    target: FULL,
    targetAt: START,
    sourceAt: START,
    rate: { numerator: 1, denominator: 1 },
    source: FULL,
  }] };
}

function assertPoint(value: AudioSourceTimePoint, label: string): void {
  assert(value.edge === "start" || value.edge === "end", `${label}.edge is invalid.`);
  if (value.offset.unit === "seconds") {
    assert(Number.isSafeInteger(value.offset.numerator) && value.offset.numerator >= 0
      && Number.isSafeInteger(value.offset.denominator) && value.offset.denominator > 0, `${label}.offset is invalid.`);
  } else {
    assert(Number.isSafeInteger(value.offset.value) && value.offset.value >= 0, `${label}.offset is invalid.`);
  }
}

function assertBounds(value: AudioSourceTimeBounds, label: string): void {
  assertPoint(value.from, `${label}.from`);
  assertPoint(value.until, `${label}.until`);
}

export function assertAudioSourceTimeSpec(value: AudioSourceTimeSpec, label = "AudioSourceTimeSpec"): void {
  assert(Array.isArray(value.relations) && value.relations.length > 0, `${label} requires at least one relation.`);
  for (const [index, relation] of value.relations.entries()) {
    const item = `${label}.relations.${index}`;
    assertBounds(relation.target, `${item}.target`);
    assertBounds(relation.source, `${item}.source`);
    if (relation.kind === "fit") {
      assert(relation.minRate === undefined || Number.isFinite(relation.minRate) && relation.minRate > 0,
        `${item}.minRate is invalid.`);
      assert(relation.maxRate === undefined || Number.isFinite(relation.maxRate) && relation.maxRate > 0,
        `${item}.maxRate is invalid.`);
      assert(relation.minRate === undefined || relation.maxRate === undefined || relation.maxRate >= relation.minRate,
        `${item} rate bounds are reversed.`);
      continue;
    }
    assert(relation.kind === "rate", `${item}.kind is invalid.`);
    assertPoint(relation.targetAt, `${item}.targetAt`);
    assertPoint(relation.sourceAt, `${item}.sourceAt`);
    assert(Number.isSafeInteger(relation.rate.numerator) && relation.rate.numerator > 0
      && Number.isSafeInteger(relation.rate.denominator) && relation.rate.denominator > 0,
    `${item}.rate is invalid.`);
    if (relation.wrap !== undefined) assertBounds(relation.wrap, `${item}.wrap`);
  }
}

function point(value: AudioSourceTimePoint, length: number, timeline: Timeline, label: string): number {
  const offset = temporalDurationInSamples(value.offset, timeline);
  const result = value.edge === "start" ? offset : length - offset;
  assert(Number.isSafeInteger(result) && result >= 0 && result <= length, `${label} is outside its domain.`);
  return result;
}

function bounds(value: AudioSourceTimeBounds, length: number, timeline: Timeline, label: string) {
  const startSample = point(value.from, length, timeline, `${label}.from`);
  const endSampleExclusive = point(value.until, length, timeline, `${label}.until`);
  assert(endSampleExclusive > startSample, `${label} is empty or reversed.`);
  return { startSample, endSampleExclusive };
}

function sourceAt(sourceAnchor: number, targetAnchor: number, rate: AudioSourceTimeRational, target: number) {
  return rational(BigInt(sourceAnchor) * BigInt(rate.denominator)
    + BigInt(target - targetAnchor) * BigInt(rate.numerator), BigInt(rate.denominator));
}

function compare(value: AudioSourceTimeRational, integer: number): number {
  const difference = BigInt(value.numerator) - BigInt(integer) * BigInt(value.denominator);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function firstTrue(from: number, until: number, predicate: (value: number) => boolean): number {
  let left = from;
  let right = until;
  while (left < right) {
    const middle = left + Math.floor((right - left) / 2);
    if (predicate(middle)) right = middle;
    else left = middle + 1;
  }
  return left;
}

function resolveRate(
  relation: Extract<AudioSourceTimeRelation, { readonly kind: "rate" }>,
  targetLength: number,
  sourceLength: number,
  timeline: Timeline,
  label: string,
): AudioSourceTimePiece {
  const authoredTarget = bounds(relation.target, targetLength, timeline, `${label}.target`);
  const permittedSource = bounds(relation.source, sourceLength, timeline, `${label}.source`);
  const targetAnchor = point(relation.targetAt, targetLength, timeline, `${label}.targetAt`);
  const sourceAnchor = point(relation.sourceAt, sourceLength, timeline, `${label}.sourceAt`);
  const wrap = relation.wrap === undefined ? undefined : bounds(relation.wrap, sourceLength, timeline, `${label}.wrap`);
  let target = authoredTarget;
  if (wrap === undefined) {
    const at = (sample: number) => sourceAt(sourceAnchor, targetAnchor, relation.rate, sample);
    const startSample = firstTrue(target.startSample, target.endSampleExclusive,
      (sample) => compare(at(sample), permittedSource.startSample) >= 0);
    const clippedEnd = firstTrue(startSample, target.endSampleExclusive,
      (sample) => compare(at(sample), permittedSource.endSampleExclusive) >= 0);
    // A non-integer rate reaches a whole source sample only every `step` target samples; Composition
    // requires both ends of a piece on one, so snap inward to the nearest such samples.
    const step = relation.rate.denominator / Number(gcd(BigInt(relation.rate.numerator), BigInt(relation.rate.denominator)));
    const phase = (sample: number) => ((sample - targetAnchor) % step + step) % step;
    const exactStart = startSample + (step - phase(startSample)) % step;
    const lastWithin = compare(at(clippedEnd), permittedSource.endSampleExclusive) > 0 ? clippedEnd - 1 : clippedEnd;
    const endSampleExclusive = lastWithin - phase(lastWithin);
    assert(endSampleExclusive > exactStart, `${label} does not sample any source audio.`);
    target = { startSample: exactStart, endSampleExclusive };
  }
  const rawStart = sourceAt(sourceAnchor, targetAnchor, relation.rate, target.startSample);
  let sourceAtStart = rawStart;
  if (wrap !== undefined) {
    assert(rawStart.denominator === 1, `${label} periodic phase must resolve to an exact source sample.`);
    const length = wrap.endSampleExclusive - wrap.startSample;
    sourceAtStart = rational(BigInt(wrap.startSample + ((rawStart.numerator - wrap.startSample) % length + length) % length));
  }
  return {
    target,
    sourceAtStart,
    rate: { ...relation.rate },
    ...(wrap === undefined ? {} : { wrap }),
  };
}

function resolveRelation(relation: AudioSourceTimeRelation, targetLength: number, sourceLength: number,
  timeline: Timeline, label: string): AudioSourceTimePiece {
  if (relation.kind === "rate") return resolveRate(relation, targetLength, sourceLength, timeline, label);
  const target = bounds(relation.target, targetLength, timeline, `${label}.target`);
  const source = bounds(relation.source, sourceLength, timeline, `${label}.source`);
  const rate = rational(BigInt(source.endSampleExclusive - source.startSample),
    BigInt(target.endSampleExclusive - target.startSample));
  const numericRate = rate.numerator / rate.denominator;
  assert(relation.minRate === undefined || numericRate >= relation.minRate,
    `${label} requires rate ${numericRate}, below authored minimum ${relation.minRate}.`);
  assert(relation.maxRate === undefined || numericRate <= relation.maxRate,
    `${label} requires rate ${numericRate}, above authored maximum ${relation.maxRate}.`);
  return { target, sourceAtStart: rational(BigInt(source.startSample)), rate };
}

export function resolveAudioSourceTime(input: {
  readonly timeline: Timeline;
  readonly sourceSampleFrames: number;
  readonly targetSampleFrames: number;
  readonly spec?: AudioSourceTimeSpec;
}): AudioSourceTimeMap {
  assert(Number.isSafeInteger(input.sourceSampleFrames) && input.sourceSampleFrames > 0,
    "Audio source sample count is invalid.");
  assert(Number.isSafeInteger(input.targetSampleFrames) && input.targetSampleFrames > 0,
    "Audio target sample count is invalid.");
  const spec = input.spec ?? defaultAudioSourceTimeSpec();
  assertAudioSourceTimeSpec(spec);
  const pieces = spec.relations.map((relation, index) => resolveRelation(relation,
    input.targetSampleFrames, input.sourceSampleFrames, input.timeline, `AudioSourceTimeSpec.relations.${index}`))
    .sort((left, right) => left.target.startSample - right.target.startSample);
  let previousEnd = 0;
  for (const [index, piece] of pieces.entries()) {
    assert(piece.target.startSample >= previousEnd, `Audio source-time pieces ${index - 1} and ${index} overlap.`);
    previousEnd = piece.target.endSampleExclusive;
  }
  return { sourceSampleFrames: input.sourceSampleFrames, pieces };
}
