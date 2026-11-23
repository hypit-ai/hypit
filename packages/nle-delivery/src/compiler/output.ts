import type { HtmlFrameRate } from "@hypit/html-program";
import {
  addExactTemporalValues,
  compareExactTemporalValues,
  exactTemporalZero,
  subtractExactTemporalValues,
  temporalRangeRegionSet,
  type ExactTemporalValue,
  type TemporalRange,
} from "@hypit/temporal/algebra";
import type { CompilationGraph } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertFrameRate(value: HtmlFrameRate): void {
  assert(Number.isSafeInteger(value.numerator) && value.numerator > 0
    && Number.isSafeInteger(value.denominator) && value.denominator > 0,
  "Picture frame rate is invalid.");
}

/** Exact Programme-local position of one zero-origin output frame. */
function framePosition(frame: number, rate: HtmlFrameRate): ExactTemporalValue {
  assertFrameRate(rate);
  assert(Number.isSafeInteger(frame) && frame >= 0, "Picture frame is invalid.");
  return {
    ticks: String(BigInt(frame) * BigInt(rate.denominator)),
    timeBase: { numerator: 1, denominator: rate.numerator },
  };
}

/** Cover one positive exact duration with the selected rational output grid. */
function frameCount(duration: ExactTemporalValue, rate: HtmlFrameRate): number {
  assertFrameRate(rate);
  const ticks = BigInt(duration.ticks);
  const numerator = ticks * BigInt(duration.timeBase.numerator) * BigInt(rate.numerator);
  const denominator = BigInt(duration.timeBase.denominator) * BigInt(rate.denominator);
  assert(numerator > 0n, "Picture output duration must be positive.");
  const count = (numerator + denominator - 1n) / denominator;
  assert(count <= BigInt(Number.MAX_SAFE_INTEGER), "Picture frame count exceeds safe integer range.");
  return Number(count);
}

/** Close an invocation-selected Picture range and grid into exact frame observations. */
export function pictureFramePositions(
  program: CompilationGraph,
  rate: HtmlFrameRate,
  range: TemporalRange = { start: exactTemporalZero(), end: structuredClone(program.domain.duration) },
  frames?: readonly number[],
): readonly ExactTemporalValue[] {
  assertFrameRate(rate);
  assert(program.picture !== undefined && program.pictureDomain !== undefined,
    `Programme ${program.id} has no Picture output.`);
  temporalRangeRegionSet(program.domain, range);
  assert(compareExactTemporalValues(range.start, range.end) < 0,
    "Picture output range must be positive.");
  const count = frameCount(subtractExactTemporalValues(range.end, range.start), rate);
  if (frames !== undefined) {
    assert(frames.length > 0 && frames.every((frame, index) => Number.isSafeInteger(frame)
      && frame >= 0 && frame < count && (index === 0 || frame > frames[index - 1]!)),
    "Picture samples require increasing frame indices inside the selected range.");
    return frames.map(frame => addExactTemporalValues(range.start, framePosition(frame, rate)));
  }
  return Array.from({ length: count }, (_, frame) => addExactTemporalValues(range.start, framePosition(frame, rate)));
}
