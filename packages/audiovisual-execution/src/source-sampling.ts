import {
  exactTemporalRational,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";
import type { TemporalSamplingGrid } from "@hypit/temporal";

import type { PlannedSourceExecution } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function lcm(left: bigint, right: bigint): bigint {
  if (left === 0n || right === 0n) return 0n;
  return absolute(left / gcd(left, right) * right);
}

/**
 * Close exact Source-local observations onto the coarsest zero-origin rational
 * grid that contains them. The optional fallback is used only when every
 * observation is zero (for example, a one-frame request).
 */
export function inferPlannedPictureSamplingGrid(
  task: PlannedSourceExecution,
  fallback: ExactTemporalValue,
  maximumFramesPerSecond: number,
): TemporalSamplingGrid {
  assert(task.signal === "picture", `Source task ${task.task} is not a Picture task.`);
  assert(Number.isSafeInteger(maximumFramesPerSecond) && maximumFramesPerSecond > 0,
    "Maximum Picture frame rate is invalid.");
  const values = (task.samples ?? []).map((sample) => sample.position);
  if (values.every((value) => exactTemporalRational(value).numerator === 0n)) values.push(fallback);
  assert(values.length > 0, `Picture Source ${task.source}.${task.output} has no exact sampling evidence.`);

  const rationals = values.map(exactTemporalRational);
  const denominator = rationals.reduce((value, item) => lcm(value, item.denominator), 1n);
  const tick = rationals.reduce((value, item) => gcd(
    value,
    item.numerator * (denominator / item.denominator),
  ), 0n);
  assert(tick > 0n,
    `Picture Source ${task.source}.${task.output} has no non-zero sampling evidence.`);
  const divisor = gcd(denominator, tick);
  const numerator = denominator / divisor;
  const rateDenominator = tick / divisor;
  assert(numerator <= BigInt(Number.MAX_SAFE_INTEGER)
    && rateDenominator <= BigInt(Number.MAX_SAFE_INTEGER),
  `Picture Source ${task.source}.${task.output} sampling grid exceeds safe integer precision.`);
  assert(numerator <= BigInt(maximumFramesPerSecond) * rateDenominator,
    `Picture Source ${task.source}.${task.output} requires ${numerator}/${rateDenominator} fps, above the selected limit ${maximumFramesPerSecond}.`);
  return {
    frameRate: {
      numerator: Number(numerator),
      denominator: Number(rateDenominator),
    },
  };
}
