import {
  compareExactTemporalValues,
  exactTemporalRational,
  exactTemporalValue,
  exactTemporalZero,
} from "./exact.js";
import { add, compare, multiply, rational, subtract } from "./rational.js";
import type { Rational } from "./rational.js";
import { assertLocalTemporalDomain } from "./domain.js";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalMap,
  TemporalMapPiece,
  TemporalMapStage,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function modulo(value: Rational, length: Rational): Rational {
  assert(length.numerator > 0n, "Temporal wrap range must be non-empty.");
  const scaledNumerator = value.numerator * length.denominator;
  const scaledDenominator = value.denominator * length.numerator;
  let quotient = scaledNumerator / scaledDenominator;
  if (scaledNumerator < 0n && scaledNumerator % scaledDenominator !== 0n) quotient -= 1n;
  return subtract(value, multiply(length, rational(quotient)));
}

function stagePiece(stage: TemporalMapStage, targetAt: ExactTemporalValue): TemporalMapPiece | undefined {
  const target = exactTemporalRational(targetAt);
  const last = stage.pieces.at(-1);
  return stage.pieces.find((candidate) => {
    const start = exactTemporalRational(candidate.target.start);
    const end = exactTemporalRational(candidate.target.end);
    return compare(target, start) >= 0 && (compare(target, end) < 0
      || (candidate === last && compare(target, end) === 0));
  });
}

function stageValue(stage: TemporalMapStage, targetAt: ExactTemporalValue): ExactTemporalValue | undefined {
  const piece = stagePiece(stage, targetAt);
  if (piece === undefined) return undefined;
  const target = exactTemporalRational(targetAt);
  const delta = subtract(target, exactTemporalRational(piece.target.start));
  const rate = rational(BigInt(piece.rate.numerator), BigInt(piece.rate.denominator));
  let source = add(exactTemporalRational(piece.sourceAtStart), multiply(delta, rate));
  if (piece.wrap !== undefined) {
    const wrapStart = exactTemporalRational(piece.wrap.start);
    const wrapEnd = exactTemporalRational(piece.wrap.end);
    const wrapLength = subtract(wrapEnd, wrapStart);
    source = add(wrapStart, modulo(subtract(source, wrapStart), wrapLength));
    // The ends denote the same cyclic position, but a terminal sample at that
    // boundary still needs its direction. Preserve the left-hand
    // representative for reverse motion so a decoded-frame consumer selects
    // the final sample in the interval rather than its first sample.
    if (rate.numerator < 0n && compare(source, wrapStart) === 0) source = wrapEnd;
  }
  return exactTemporalValue(source);
}

function assertPiece(
  piece: TemporalMapPiece,
  target: LocalTemporalDomain,
  source: LocalTemporalDomain,
  previousEnd: ExactTemporalValue | undefined,
): void {
  const targetStart = exactTemporalRational(piece.target.start);
  const targetEnd = exactTemporalRational(piece.target.end);
  assert(compare(targetStart, rational(0n)) >= 0 && compare(targetStart, targetEnd) < 0
    && compare(targetEnd, exactTemporalRational(target.duration)) <= 0,
  `Temporal Map piece lies outside target domain ${target.id}.`);
  if (previousEnd !== undefined) {
    assert(compareExactTemporalValues(previousEnd, piece.target.start) <= 0,
      `Temporal Map pieces overlap in target domain ${target.id}.`);
  }
  assert(Number.isSafeInteger(piece.rate.numerator), "Temporal Map rate numerator is invalid.");
  assert(Number.isSafeInteger(piece.rate.denominator) && piece.rate.denominator > 0,
    "Temporal Map rate denominator is invalid.");
  const sourceStart = exactTemporalRational(piece.sourceAtStart);
  const sourceDuration = exactTemporalRational(source.duration);
  assert(compare(sourceStart, rational(0n)) >= 0 && compare(sourceStart, sourceDuration) <= 0,
    `Temporal Map source position lies outside source domain ${source.id}.`);
  if (piece.wrap !== undefined) {
    const wrapStart = exactTemporalRational(piece.wrap.start);
    const wrapEnd = exactTemporalRational(piece.wrap.end);
    assert(compare(wrapStart, rational(0n)) >= 0 && compare(wrapStart, wrapEnd) < 0
      && compare(wrapEnd, sourceDuration) <= 0,
    `Temporal Map wrap lies outside source domain ${source.id}.`);
    assert(compare(sourceStart, wrapStart) >= 0 && compare(sourceStart, wrapEnd) <= 0,
      "Temporal Map wrapped source position must begin inside its wrap range.");
    return;
  }
  const delta = subtract(targetEnd, targetStart);
  const sourceEnd = add(sourceStart, multiply(delta,
    rational(BigInt(piece.rate.numerator), BigInt(piece.rate.denominator))));
  assert(compare(sourceEnd, rational(0n)) >= 0 && compare(sourceEnd, sourceDuration) <= 0,
    `Temporal Map piece leaves source domain ${source.id}.`);
}

/** Validate one self-contained target-to-source relation. */
export function assertTemporalMap(value: TemporalMap): void {
  assert(value.stages.length > 0, "Temporal Map must contain at least one stage.");
  for (const [index, stage] of value.stages.entries()) {
    assertLocalTemporalDomain(stage.target);
    assertLocalTemporalDomain(stage.source);
    const target = stage.target;
    const source = stage.source;
    if (index > 0) {
      const previous = value.stages[index - 1]!.source;
      assert(previous.id === target.id
        && compareExactTemporalValues(previous.duration, target.duration) === 0,
        "Temporal Map stages do not form one composable chain.");
    }
    let previousEnd: ExactTemporalValue | undefined;
    for (const piece of stage.pieces) {
      assertPiece(piece, target, source, previousEnd);
      previousEnd = piece.target.end;
    }
  }
}

export function sealTemporalMap(value: TemporalMap): TemporalMap {
  assertTemporalMap(value);
  return structuredClone(value);
}

export function identityTemporalMap(domain: LocalTemporalDomain): TemporalMap {
  assertLocalTemporalDomain(domain);
  return sealTemporalMap({
    stages: [{
      target: structuredClone(domain),
      source: structuredClone(domain),
      pieces: [{
        target: { start: exactTemporalZero(), end: domain.duration },
        sourceAtStart: exactTemporalZero(),
        rate: { numerator: 1, denominator: 1 },
      }],
    }],
  });
}

export function composeTemporalMaps(first: TemporalMap, second: TemporalMap): TemporalMap {
  assertTemporalMap(first);
  assertTemporalMap(second);
  const firstSource = first.stages.at(-1)!.source;
  const secondTarget = second.stages[0]!.target;
  assert(firstSource.id === secondTarget.id,
    `Cannot compose Temporal Maps through ${firstSource.id} and ${secondTarget.id}.`);
  assert(compareExactTemporalValues(firstSource.duration, secondTarget.duration) === 0,
  `Cannot compose Temporal Maps through differently sized domain ${firstSource.id}.`);
  return {
    stages: [...structuredClone(first.stages), ...structuredClone(second.stages)],
  };
}

/** Evaluate one target boundary. A gap has no image. */
export function evaluateTemporalMap(value: TemporalMap, targetAt: ExactTemporalValue): ExactTemporalValue | undefined {
  let current: ExactTemporalValue | undefined = targetAt;
  for (const stage of value.stages) {
    if (current === undefined) return undefined;
    current = stageValue(stage, current);
  }
  return current;
}

/** Local orientation of the complete Map at one target boundary. */
export function temporalMapDirectionAt(
  value: TemporalMap,
  targetAt: ExactTemporalValue,
): -1 | 0 | 1 | undefined {
  let current: ExactTemporalValue | undefined = targetAt;
  let direction: -1 | 0 | 1 = 1;
  for (const stage of value.stages) {
    if (current === undefined) return undefined;
    const piece = stagePiece(stage, current);
    if (piece === undefined) return undefined;
    const stageDirection = Math.sign(piece.rate.numerator) as -1 | 0 | 1;
    direction = direction === 0 || stageDirection === 0
      ? 0
      : direction === stageDirection ? 1 : -1;
    current = stageValue(stage, current);
  }
  return direction;
}
