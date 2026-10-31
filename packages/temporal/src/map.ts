import {
  compareExactTemporalValues,
  exactTemporalRational,
  exactTemporalValue,
  exactTemporalZero,
} from "./exact.js";
import { add, compare, divide, multiply, rational, subtract } from "./rational.js";
import type { Rational } from "./rational.js";
import { assertLocalTemporalDomain } from "./domain.js";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalMap,
  TemporalAffineMapPiece,
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

export type TemporalMapSide = "before" | "after";

export type TemporalMapEvaluation = {
  readonly position: ExactTemporalValue;
  /** Which side of `position` is the image of the requested target side. */
  readonly sourceSide: TemporalMapSide;
};

export type TemporalMapEvaluator = (
  targetAt: ExactTemporalValue,
  side: TemporalMapSide,
) => TemporalMapEvaluation | undefined;

function stagePiece(
  stage: TemporalMapStage,
  targetAt: ExactTemporalValue,
  side: TemporalMapSide,
): TemporalMapPiece | undefined {
  const target = exactTemporalRational(targetAt);
  const inside = stage.pieces.find((candidate) => {
    const start = exactTemporalRational(candidate.target.start);
    const end = exactTemporalRational(candidate.target.end);
    return compare(target, start) > 0 && compare(target, end) < 0;
  });
  if (inside !== undefined) return inside;
  const begins = stage.pieces.find((candidate) =>
    compare(target, exactTemporalRational(candidate.target.start)) === 0);
  const ends = stage.pieces.findLast((candidate) =>
    compare(target, exactTemporalRational(candidate.target.end)) === 0);
  return side === "before" ? ends : begins;
}

export function isAffineTemporalMapPiece(piece: TemporalMapPiece): piece is TemporalAffineMapPiece {
  return "rate" in piece;
}

function cubicPosition(piece: Exclude<TemporalMapPiece, TemporalAffineMapPiece>, target: Rational): Rational {
  const start = exactTemporalRational(piece.target.start);
  const length = subtract(exactTemporalRational(piece.target.end), start);
  const u = divide(subtract(target, start), length);
  const oneMinusU = subtract(rational(1n), u);
  const square = (value: Rational) => multiply(value, value);
  const cube = (value: Rational) => multiply(square(value), value);
  const three = rational(3n);
  return add(
    add(multiply(cube(oneMinusU), exactTemporalRational(piece.sourceAtStart)),
      multiply(multiply(three, multiply(square(oneMinusU), u)), exactTemporalRational(piece.sourceControl1))),
    add(multiply(multiply(three, multiply(oneMinusU, square(u))), exactTemporalRational(piece.sourceControl2)),
      multiply(cube(u), exactTemporalRational(piece.sourceAtEnd))),
  );
}

function pieceValue(piece: TemporalMapPiece, targetAt: ExactTemporalValue): ExactTemporalValue {
  const target = exactTemporalRational(targetAt);
  if (!isAffineTemporalMapPiece(piece)) return exactTemporalValue(cubicPosition(piece, target));
  const delta = subtract(target, exactTemporalRational(piece.target.start));
  const rate = rational(BigInt(piece.rate.numerator), BigInt(piece.rate.denominator));
  let source = add(exactTemporalRational(piece.sourceAtStart), multiply(delta, rate));
  if (piece.wrap !== undefined) {
    const wrapStart = exactTemporalRational(piece.wrap.start);
    const wrapEnd = exactTemporalRational(piece.wrap.end);
    const wrapLength = subtract(wrapEnd, wrapStart);
    source = add(wrapStart, modulo(subtract(source, wrapStart), wrapLength));
  }
  return exactTemporalValue(source);
}

function sidedPieceValue(
  piece: TemporalMapPiece,
  targetAt: ExactTemporalValue,
  sourceSide: TemporalMapSide,
): ExactTemporalValue {
  const position = pieceValue(piece, targetAt);
  if (!isAffineTemporalMapPiece(piece) || piece.wrap === undefined || sourceSide !== "before"
    || compareExactTemporalValues(position, piece.wrap.start) !== 0) return position;
  // wrap.start/after and wrap.end/before are the two exact representatives of
  // the cyclic seam. Keeping the representative and side together avoids a
  // renderer-specific "reverse endpoint" exception.
  return structuredClone(piece.wrap.end);
}

function pieceDirection(piece: TemporalMapPiece): -1 | 0 | 1 {
  return isAffineTemporalMapPiece(piece)
    ? Math.sign(piece.rate.numerator) as -1 | 0 | 1
    : compareExactTemporalValues(piece.sourceAtStart, piece.sourceAtEnd) < 0 ? 1
      : compareExactTemporalValues(piece.sourceAtStart, piece.sourceAtEnd) > 0 ? -1 : 0;
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
  const sourceStart = exactTemporalRational(piece.sourceAtStart);
  const sourceDuration = exactTemporalRational(source.duration);
  assert(compare(sourceStart, rational(0n)) >= 0 && compare(sourceStart, sourceDuration) <= 0,
    `Temporal Map source position lies outside source domain ${source.id}.`);
  if (!isAffineTemporalMapPiece(piece)) {
    const control1 = exactTemporalRational(piece.sourceControl1);
    const control2 = exactTemporalRational(piece.sourceControl2);
    const sourceEnd = exactTemporalRational(piece.sourceAtEnd);
    for (const value of [control1, control2, sourceEnd]) {
      assert(compare(value, rational(0n)) >= 0 && compare(value, sourceDuration) <= 0,
        `Temporal Map cubic position lies outside source domain ${source.id}.`);
    }
    const increasing = compare(sourceStart, control1) <= 0 && compare(control1, control2) <= 0
      && compare(control2, sourceEnd) <= 0;
    const decreasing = compare(sourceStart, control1) >= 0 && compare(control1, control2) >= 0
      && compare(control2, sourceEnd) >= 0;
    assert(increasing || decreasing,
      "Temporal Map cubic controls must be monotone; split direction changes into adjacent pieces.");
    return;
  }
  assert(Number.isSafeInteger(piece.rate.numerator), "Temporal Map rate numerator is invalid.");
  assert(Number.isSafeInteger(piece.rate.denominator) && piece.rate.denominator > 0,
    "Temporal Map rate denominator is invalid.");
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

/**
 * Evaluate one side of an exact target position through the complete Map.
 *
 * A TemporalMap is a piecewise relation, so an unsided value at a piece or gap
 * boundary is ambiguous. Content beginning at a frame or sample boundary uses
 * `after`; an exclusive interval end uses `before`. Reverse pieces flip the
 * side at every stage. A hold deliberately starts a new `after` side at its
 * fixed source position: it selects that position as content instead of
 * pretending that a zero derivative still carries an earlier orientation.
 */
function evaluateTemporalMapCore(
  value: TemporalMap,
  targetAt: ExactTemporalValue,
  side: TemporalMapSide,
): TemporalMapEvaluation | undefined {
  let current = targetAt;
  let sourceSide = side;
  for (const stage of value.stages) {
    const piece = stagePiece(stage, current, sourceSide);
    if (piece === undefined) return undefined;
    const direction = pieceDirection(piece);
    sourceSide = direction === 0 ? "after"
      : direction > 0 ? sourceSide
        : sourceSide === "before" ? "after" : "before";
    current = sidedPieceValue(piece, current, sourceSide);
  }
  return { position: current, sourceSide };
}

export function evaluateTemporalMap(
  value: TemporalMap,
  targetAt: ExactTemporalValue,
  side: TemporalMapSide,
): TemporalMapEvaluation | undefined {
  assertTemporalMap(value);
  return evaluateTemporalMapCore(value, targetAt, side);
}

/**
 * Validate one immutable Map at an execution boundary and bind its evaluator.
 *
 * This is the same sided evaluation engine as `evaluateTemporalMap`; it only
 * moves structural validation out of frame/sample hot loops. Callers must not
 * mutate the readonly Map after binding it.
 */
export function createTemporalMapEvaluator(value: TemporalMap): TemporalMapEvaluator {
  assertTemporalMap(value);
  return (targetAt, side) => evaluateTemporalMapCore(value, targetAt, side);
}

/** Restrict a Map's target interval and rebase it to a new local origin. */
export function sliceTemporalMap(value: TemporalMap, from: ExactTemporalValue, until: ExactTemporalValue, targetId: string): TemporalMap {
  assertTemporalMap(value);
  const first = value.stages[0]!;
  const start = exactTemporalRational(from), end = exactTemporalRational(until);
  assert(compare(start, rational(0n)) >= 0 && compare(start, end) < 0
    && compare(end, exactTemporalRational(first.target.duration)) <= 0, 'Temporal Map slice exceeds its target domain.');
  const duration = exactTemporalValue(subtract(end, start));
  const pieces = first.pieces.flatMap((piece): TemporalMapPiece[] => {
    const p = exactTemporalRational(piece.target.start), q = exactTemporalRational(piece.target.end);
    const left = compare(p, start) > 0 ? p : start, right = compare(q, end) < 0 ? q : end;
    if (compare(left, right) >= 0) return [];
    const target = { start: exactTemporalValue(subtract(left, start)), end: exactTemporalValue(subtract(right, start)) };
    const sourceAtStart = pieceValue(piece, exactTemporalValue(left));
    if (isAffineTemporalMapPiece(piece)) return [{ ...structuredClone(piece), target, sourceAtStart }];
    const length = subtract(q, p), u = divide(subtract(left, p), length), v = divide(subtract(right, p), length);
    const derivative = (t: Rational): Rational => {
      const c = subtract(rational(1n), t), three = rational(3n);
      const a = exactTemporalRational(piece.sourceAtStart), b = exactTemporalRational(piece.sourceControl1);
      const d = exactTemporalRational(piece.sourceControl2), e = exactTemporalRational(piece.sourceAtEnd);
      return multiply(three, add(add(multiply(multiply(c, c), subtract(b, a)), multiply(multiply(rational(2n), multiply(c, t)), subtract(d, b))), multiply(multiply(t, t), subtract(e, d))));
    };
    const scale = divide(subtract(v, u), rational(3n)), sourceAtEnd = pieceValue(piece, exactTemporalValue(right));
    return [{ target, sourceAtStart, sourceAtEnd,
      sourceControl1: exactTemporalValue(add(exactTemporalRational(sourceAtStart), multiply(derivative(u), scale))),
      sourceControl2: exactTemporalValue(subtract(exactTemporalRational(sourceAtEnd), multiply(derivative(v), scale))) }];
  });
  return sealTemporalMap({ stages: [{ ...structuredClone(first), target: { id: targetId, duration }, pieces }, ...structuredClone(value.stages.slice(1))] });
}

/** Extend the target clock using its boundary rates while retaining authored interior mappings. */
export function extendTemporalMap(value: TemporalMap, before: ExactTemporalValue, after: ExactTemporalValue, targetId: string): TemporalMap {
  assertTemporalMap(value);
  const first = value.stages[0]!;
  const lead = exactTemporalRational(before), tail = exactTemporalRational(after), zero = rational(0n);
  assert(compare(lead, zero) >= 0 && compare(tail, zero) >= 0, "Temporal Map extensions must be nonnegative.");
  const duration = exactTemporalValue(add(add(lead, exactTemporalRational(first.target.duration)), tail));
  const pieces = first.pieces.map((piece, index): TemporalMapPiece => {
    const atStart = index === 0 && compare(lead, zero) > 0;
    const atEnd = index === first.pieces.length - 1 && compare(tail, zero) > 0;
    if (atStart || atEnd) {
      assert(isAffineTemporalMapPiece(piece), "Temporal Map extension requires an affine boundary rate.");
      if (atStart) assert(compareExactTemporalValues(piece.target.start, exactTemporalZero()) === 0, "Temporal Map has no mapping at its start.");
      if (atEnd) assert(compareExactTemporalValues(piece.target.end, first.target.duration) === 0, "Temporal Map has no mapping at its end.");
    }
    return {
      ...structuredClone(piece),
      target: {
        start: atStart ? exactTemporalZero() : exactTemporalValue(add(exactTemporalRational(piece.target.start), lead)),
        end: atEnd ? duration : exactTemporalValue(add(exactTemporalRational(piece.target.end), lead)),
      },
      sourceAtStart: atStart ? pieceValue(piece, exactTemporalValue(subtract(zero, lead))) : structuredClone(piece.sourceAtStart),
    };
  });
  assert(pieces.length > 0, "Temporal Map extension requires a sampling relation.");
  return sealTemporalMap({ stages: [{ ...structuredClone(first), target: { id: targetId, duration }, pieces }, ...structuredClone(value.stages.slice(1))] });
}
