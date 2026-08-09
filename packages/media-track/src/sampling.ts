import type {
  VisualSamplingRational,
  VisualSamplingSegment,
  VisualTimedSampling,
} from "@narratage/composition";
import { assertProgramSpaceIdentity } from "@narratage/program-space";
import type { ProgramSpace } from "@narratage/program-space";

import type { MediaVisualOccupancy, MediaVisualTrim } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function rational(numerator: bigint, denominator = 1n): VisualSamplingRational {
  assert(denominator > 0n && numerator >= 0n, "Media visual sampling rational is negative or undefined.");
  const divisor = gcd(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  assert(reducedNumerator <= BigInt(Number.MAX_SAFE_INTEGER)
    && reducedDenominator <= BigInt(Number.MAX_SAFE_INTEGER),
  "Media visual sampling rational exceeds safe wire arithmetic.");
  return { numerator: Number(reducedNumerator), denominator: Number(reducedDenominator) };
}

function segment(
  startFrame: number,
  endFrameExclusive: number,
  sourceFrame: VisualSamplingRational,
  rate: VisualSamplingRational,
  loop?: MediaVisualTrim,
): VisualSamplingSegment {
  return {
    target: { startFrame, endFrameExclusive },
    sourceFrame,
    rate,
    ...(loop === undefined ? {} : { loop: { ...loop } }),
  };
}

function assertOccupancy(value: MediaVisualOccupancy): void {
  if (value.mode === "stretch") return;
  assert(["once", "hold", "loop"].includes(value.mode), "Media visual occupancy mode is invalid.");
  assert(value.align === "start" || value.align === "end", "Media visual occupancy alignment is invalid.");
}

/**
 * Resolve package-owned trim/occupancy intent into the renderer-neutral exact
 * source-frame function. Timed media is normalized to Program frame rate
 * upstream, so native playback advances exactly one source frame per Program
 * frame. This avoids a second, renderer-specific frame quantizer.
 */
export function resolveVisualSampling(input: {
  readonly space: ProgramSpace;
  readonly sourceFrameRate: { readonly numerator: number; readonly denominator: number };
  readonly sourceFrameCount: number;
  readonly targetFrameCount: number;
  readonly trim?: MediaVisualTrim;
  readonly occupancy: MediaVisualOccupancy;
}): VisualTimedSampling {
  assertProgramSpaceIdentity(input.space);
  assert(Number.isSafeInteger(input.sourceFrameCount) && input.sourceFrameCount > 0,
    "Timed visual source frame count is invalid.");
  assert(Number.isSafeInteger(input.targetFrameCount) && input.targetFrameCount > 0,
    "Timed visual target frame count is invalid.");
  assert(input.sourceFrameRate.numerator === input.space.frameRate.numerator
    && input.sourceFrameRate.denominator === input.space.frameRate.denominator,
  "Timed visual source must be normalized to ProgramSpace frame rate before Media authoring.");
  assertOccupancy(input.occupancy);
  const trim = input.trim ?? { startFrame: 0, endFrameExclusive: input.sourceFrameCount };
  assert(Number.isSafeInteger(trim.startFrame) && Number.isSafeInteger(trim.endFrameExclusive)
    && trim.startFrame >= 0 && trim.endFrameExclusive > trim.startFrame
    && trim.endFrameExclusive <= input.sourceFrameCount,
  "Timed visual trim is outside its source frame domain.");
  const sourceLength = trim.endFrameExclusive - trim.startFrame;
  const targetLength = input.targetFrameCount;
  const one = rational(1n);
  const zero = rational(0n);
  const segments: VisualSamplingSegment[] = [];

  if (input.occupancy.mode === "stretch") {
    segments.push(segment(0, targetLength, rational(BigInt(trim.startFrame)),
      rational(BigInt(sourceLength), BigInt(targetLength))));
  } else if (input.occupancy.mode === "loop") {
    const phase = input.occupancy.align === "start"
      ? 0
      : (sourceLength - (targetLength % sourceLength)) % sourceLength;
    segments.push(segment(0, targetLength, rational(BigInt(trim.startFrame + phase)), one, trim));
  } else {
    const played = Math.min(sourceLength, targetLength);
    if (input.occupancy.align === "start") {
      segments.push(segment(0, played, rational(BigInt(trim.startFrame)), one));
      if (input.occupancy.mode === "hold" && played < targetLength) {
        segments.push(segment(played, targetLength, rational(BigInt(trim.endFrameExclusive - 1)), zero));
      }
    } else {
      const targetStart = targetLength - played;
      if (input.occupancy.mode === "hold" && targetStart > 0) {
        segments.push(segment(0, targetStart, rational(BigInt(trim.startFrame)), zero));
      }
      segments.push(segment(targetStart, targetLength,
        rational(BigInt(trim.endFrameExclusive - played)), one));
    }
  }

  return {
    sourceFrameRate: { ...input.sourceFrameRate },
    sourceFrameCount: input.sourceFrameCount,
    segments,
  };
}
