import {
  assertExactTemporalValue,
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
  TemporalRange,
} from "./algebra-types.js";

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

/** One exact germ at a temporal position. `before` and `after` remain distinct at cuts. */
export type TemporalMapPoint = {
  readonly position: ExactTemporalValue;
  readonly side: TemporalMapSide;
};

/**
 * One inclusive interval in sided temporal order.
 *
 * At an equal position `before` sorts before `after`. Consequently a normal
 * piece occupies `[target.start/after, target.end/before]` without pretending
 * that either side across a cut belongs to the piece.
 */
export type TemporalMapRegion = {
  readonly start: TemporalMapPoint;
  readonly end: TemporalMapPoint;
};

export type TemporalMapRegionSet = {
  readonly domain: LocalTemporalDomain;
  readonly regions: readonly TemporalMapRegion[];
};

export type TemporalMapPreimage = TemporalMapRegionSet;

export function assertTemporalMapPoint(value: TemporalMapPoint, label = "Temporal Map point"): void {
  assert(value !== null && typeof value === "object", `${label} must be an object.`);
  assertExactTemporalValue(value.position, `${label}.position`);
  assert(value.side === "before" || value.side === "after", `${label}.side is invalid.`);
}

export function assertTemporalMapRegion(value: TemporalMapRegion, label = "Temporal Map region"): void {
  assert(value !== null && typeof value === "object", `${label} must be an object.`);
  assertTemporalMapPoint(value.start, `${label}.start`);
  assertTemporalMapPoint(value.end, `${label}.end`);
  assert(compareMapPoints(value.start, value.end) <= 0, `${label} is reversed.`);
}

export function assertTemporalMapPreimage(value: TemporalMapPreimage): void {
  assert(value !== null && typeof value === "object", "Temporal Map preimage must be an object.");
  assertLocalTemporalDomain(value.domain);
  for (const [index, region] of value.regions.entries()) {
    assertTemporalMapRegion(region, `Temporal Map preimage region ${index}`);
    assertMapPointInDomain(region.start, value.domain);
    assertMapPointInDomain(region.end, value.domain);
    if (index > 0) {
      assert(compareMapPoints(value.regions[index - 1]!.end, region.start) < 0,
        "Temporal Map preimage regions overlap or are out of order.");
    }
  }
}

export const assertTemporalMapRegionSet = assertTemporalMapPreimage;

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

function compareMapPoints(left: TemporalMapPoint, right: TemporalMapPoint): number {
  const position = compareExactTemporalValues(left.position, right.position);
  if (position !== 0) return position;
  return left.side === right.side ? 0 : left.side === "before" ? -1 : 1;
}

/** Exact ordering of sided positions; useful to domain owners building local schedules. */
export const compareTemporalMapPoints = compareMapPoints;

function flipMapSide(side: TemporalMapSide): TemporalMapSide {
  return side === "before" ? "after" : "before";
}

function mapPoint(position: ExactTemporalValue, side: TemporalMapSide): TemporalMapPoint {
  return { position: structuredClone(position), side };
}

function mapRegion(start: TemporalMapPoint, end: TemporalMapPoint): TemporalMapRegion {
  assert(compareMapPoints(start, end) <= 0, "Temporal Map region is reversed.");
  return { start, end };
}

function intersectMapRegions(
  left: TemporalMapRegion,
  right: TemporalMapRegion,
): TemporalMapRegion | undefined {
  const start = compareMapPoints(left.start, right.start) >= 0 ? left.start : right.start;
  const end = compareMapPoints(left.end, right.end) <= 0 ? left.end : right.end;
  return compareMapPoints(start, end) <= 0 ? mapRegion(start, end) : undefined;
}

function normalizeMapRegions(regions: readonly TemporalMapRegion[]): readonly TemporalMapRegion[] {
  const sorted = [...regions].sort((left, right) => compareMapPoints(left.start, right.start)
    || compareMapPoints(left.end, right.end));
  const result: TemporalMapRegion[] = [];
  for (const region of sorted) {
    const previous = result.at(-1);
    if (previous === undefined || compareMapPoints(region.start, previous.end) > 0) {
      result.push(mapRegion(region.start, region.end));
      continue;
    }
    if (compareMapPoints(region.end, previous.end) > 0) {
      result[result.length - 1] = mapRegion(previous.start, region.end);
    }
  }
  return result;
}

function floorRational(value: Rational): bigint {
  let quotient = value.numerator / value.denominator;
  if (value.numerator < 0n && value.numerator % value.denominator !== 0n) quotient -= 1n;
  return quotient;
}

function ceilRational(value: Rational): bigint {
  return -floorRational(rational(-value.numerator, value.denominator));
}

type AffineBranch = {
  readonly piece: TemporalAffineMapPiece;
  readonly target: TemporalMapRegion;
};

function rawAffinePosition(piece: TemporalAffineMapPiece, target: Rational): Rational {
  const rate = rational(BigInt(piece.rate.numerator), BigInt(piece.rate.denominator));
  return add(exactTemporalRational(piece.sourceAtStart), multiply(
    subtract(target, exactTemporalRational(piece.target.start)), rate,
  ));
}

function affinePointValue(piece: TemporalAffineMapPiece, target: TemporalMapPoint): TemporalMapPoint {
  const direction = Math.sign(piece.rate.numerator) as -1 | 0 | 1;
  const sourceSide = direction === 0 ? "after"
    : direction > 0 ? target.side : flipMapSide(target.side);
  return mapPoint(sidedPieceValue(piece, target.position, sourceSide), sourceSide);
}

function affineBranches(piece: TemporalAffineMapPiece): readonly AffineBranch[] {
  const targetStart = exactTemporalRational(piece.target.start);
  const targetEnd = exactTemporalRational(piece.target.end);
  const boundaries: Rational[] = [targetStart, targetEnd];
  if (piece.wrap !== undefined && piece.rate.numerator !== 0) {
    const wrapStart = exactTemporalRational(piece.wrap.start);
    const wrapLength = subtract(exactTemporalRational(piece.wrap.end), wrapStart);
    const rawStart = rawAffinePosition(piece, targetStart);
    const rawEnd = rawAffinePosition(piece, targetEnd);
    const low = compare(rawStart, rawEnd) <= 0 ? rawStart : rawEnd;
    const high = compare(rawStart, rawEnd) >= 0 ? rawStart : rawEnd;
    const first = ceilRational(divide(subtract(low, wrapStart), wrapLength));
    const last = floorRational(divide(subtract(high, wrapStart), wrapLength));
    const rate = rational(BigInt(piece.rate.numerator), BigInt(piece.rate.denominator));
    for (let cycle = first; cycle <= last; cycle += 1n) {
      const seamSource = add(wrapStart, multiply(wrapLength, rational(cycle)));
      const seamTarget = add(targetStart, divide(
        subtract(seamSource, exactTemporalRational(piece.sourceAtStart)), rate,
      ));
      if (compare(seamTarget, targetStart) > 0 && compare(seamTarget, targetEnd) < 0) {
        boundaries.push(seamTarget);
      }
    }
    boundaries.sort(compare);
  }
  return boundaries.slice(0, -1).map((start, index) => ({
    piece,
    target: mapRegion(
      mapPoint(exactTemporalValue(start), "after"),
      mapPoint(exactTemporalValue(boundaries[index + 1]!), "before"),
    ),
  }));
}

function branchImage(branch: AffineBranch): TemporalMapRegion {
  const left = affinePointValue(branch.piece, branch.target.start);
  const right = affinePointValue(branch.piece, branch.target.end);
  return compareMapPoints(left, right) <= 0 ? mapRegion(left, right) : mapRegion(right, left);
}

function pointInsideRegion(point: TemporalMapPoint, region: TemporalMapRegion): boolean {
  return compareMapPoints(point, region.start) >= 0 && compareMapPoints(point, region.end) <= 0;
}

function inverseAffineBranchPoint(branch: AffineBranch, source: TemporalMapPoint): TemporalMapPoint {
  const piece = branch.piece;
  const rate = rational(BigInt(piece.rate.numerator), BigInt(piece.rate.denominator));
  assert(rate.numerator !== 0n, "A held Temporal Map branch has no point inverse.");
  const sourcePosition = exactTemporalRational(source.position);
  const candidates: Rational[] = [];
  if (piece.wrap === undefined) {
    candidates.push(sourcePosition);
  } else {
    const wrapStart = exactTemporalRational(piece.wrap.start);
    const wrapLength = subtract(exactTemporalRational(piece.wrap.end), wrapStart);
    const rawStart = rawAffinePosition(piece, exactTemporalRational(branch.target.start.position));
    const approximateCycle = floorRational(divide(subtract(rawStart, sourcePosition), wrapLength));
    for (let offset = -1n; offset <= 2n; offset += 1n) {
      candidates.push(add(sourcePosition, multiply(wrapLength, rational(approximateCycle + offset))));
    }
  }
  for (const rawSource of candidates) {
    const target = add(exactTemporalRational(piece.target.start), divide(
      subtract(rawSource, exactTemporalRational(piece.sourceAtStart)), rate,
    ));
    const result = mapPoint(exactTemporalValue(target),
      piece.rate.numerator > 0 ? source.side : flipMapSide(source.side));
    if (!pointInsideRegion(result, branch.target)) continue;
    const evaluated = affinePointValue(piece, result);
    if (compareMapPoints(evaluated, source) === 0) return result;
  }
  throw new Error("Temporal Map affine branch inverse is internally inconsistent.");
}

function affineBranchPreimage(
  branch: AffineBranch,
  source: TemporalMapRegion,
): TemporalMapRegion | undefined {
  const piece = branch.piece;
  if (piece.rate.numerator === 0) {
    const held = affinePointValue(piece, branch.target.start);
    return pointInsideRegion(held, source) ? branch.target : undefined;
  }
  const overlap = intersectMapRegions(branchImage(branch), source);
  if (overlap === undefined) return undefined;
  const left = inverseAffineBranchPoint(branch, overlap.start);
  const right = inverseAffineBranchPoint(branch, overlap.end);
  return compareMapPoints(left, right) <= 0 ? mapRegion(left, right) : mapRegion(right, left);
}

function pieceImage(piece: TemporalMapPiece): TemporalMapRegion {
  const direction = pieceDirection(piece);
  const start = mapPoint(piece.target.start, "after");
  const end = mapPoint(piece.target.end, "before");
  const left = mapPoint(sidedPieceValue(piece, start.position,
    direction === 0 ? "after" : direction > 0 ? start.side : flipMapSide(start.side)),
  direction === 0 ? "after" : direction > 0 ? start.side : flipMapSide(start.side));
  const right = mapPoint(sidedPieceValue(piece, end.position,
    direction === 0 ? "after" : direction > 0 ? end.side : flipMapSide(end.side)),
  direction === 0 ? "after" : direction > 0 ? end.side : flipMapSide(end.side));
  return compareMapPoints(left, right) <= 0 ? mapRegion(left, right) : mapRegion(right, left);
}

function stagePreimage(
  stage: TemporalMapStage,
  source: readonly TemporalMapRegion[],
): readonly TemporalMapRegion[] {
  const results: TemporalMapRegion[] = [];
  for (const piece of stage.pieces) {
    if (isAffineTemporalMapPiece(piece)) {
      for (const branch of affineBranches(piece)) for (const region of source) {
        const inverse = affineBranchPreimage(branch, region);
        if (inverse !== undefined) results.push(inverse);
      }
      continue;
    }
    const image = pieceImage(piece);
    const intersects = source.some((region) => intersectMapRegions(image, region) !== undefined);
    if (pieceDirection(piece) === 0) {
      const held = mapPoint(piece.sourceAtStart, "after");
      if (source.some((region) => pointInsideRegion(held, region))) {
        results.push(mapRegion(mapPoint(piece.target.start, "after"), mapPoint(piece.target.end, "before")));
      }
    } else if (intersects) {
      throw new Error("Exact Temporal Map preimage does not approximate cubic roots; split or resolve the curve before inversion.");
    }
  }
  return normalizeMapRegions(results);
}

function assertMapPointInDomain(point: TemporalMapPoint, domain: LocalTemporalDomain): void {
  const position = exactTemporalRational(point.position);
  assert(compare(position, rational(0n)) >= 0
    && compare(position, exactTemporalRational(domain.duration)) <= 0,
  `Temporal Map preimage query lies outside source domain ${domain.id}.`);
}

/**
 * Return the complete exact target set whose forward image lies in `source`.
 *
 * This is a bounded set-valued preimage, not a second serialized Map and not a
 * nearest-match policy. It preserves cuts, gaps, reverse direction, holds,
 * loops and every stage in the supplied Map. A point query is written as a
 * region whose start and end are the same sided point.
 *
 * Non-constant cubic position pieces are rejected when the query intersects
 * them: their exact roots are not generally rational, so silently sampling or
 * applying an epsilon would contradict this package's exact-time contract.
 */
export function preimageTemporalMap(
  value: TemporalMap,
  source: TemporalMapRegion,
): TemporalMapPreimage {
  assertTemporalMap(value);
  const sourceDomain = value.stages.at(-1)!.source;
  assertMapPointInDomain(source.start, sourceDomain);
  assertMapPointInDomain(source.end, sourceDomain);
  assert(compareMapPoints(source.start, source.end) <= 0, "Temporal Map preimage query is reversed.");
  let regions: readonly TemporalMapRegion[] = [mapRegion(source.start, source.end)];
  for (let index = value.stages.length - 1; index >= 0 && regions.length > 0; index -= 1) {
    regions = stagePreimage(value.stages[index]!, regions);
  }
  return {
    domain: structuredClone(value.stages[0]!.target),
    regions: structuredClone(regions),
  };
}

export function preimageTemporalMapRegions(
  value: TemporalMap,
  source: TemporalMapRegionSet,
): TemporalMapRegionSet {
  assertTemporalMap(value);
  assertTemporalMapRegionSet(source);
  const sourceDomain = value.stages.at(-1)!.source;
  assert(source.domain.id === sourceDomain.id
    && compareExactTemporalValues(source.domain.duration, sourceDomain.duration) === 0,
  `Temporal Map region set belongs to ${source.domain.id}, not source domain ${sourceDomain.id}.`);
  let regions: readonly TemporalMapRegion[] = source.regions;
  for (let index = value.stages.length - 1; index >= 0 && regions.length > 0; index -= 1) {
    regions = stagePreimage(value.stages[index]!, regions);
  }
  return {
    domain: structuredClone(value.stages[0]!.target),
    regions: structuredClone(regions),
  };
}

export function temporalMapPointRegion(point: TemporalMapPoint): TemporalMapRegion {
  assertTemporalMapPoint(point);
  return { start: structuredClone(point), end: structuredClone(point) };
}

export function temporalMapPointRegionSet(
  domain: LocalTemporalDomain,
  point: TemporalMapPoint,
): TemporalMapRegionSet {
  assertLocalTemporalDomain(domain);
  assertTemporalMapPoint(point);
  assertMapPointInDomain(point, domain);
  return {
    domain: structuredClone(domain),
    regions: [temporalMapPointRegion(point)],
  };
}

export function uniqueTemporalMapPreimagePoint(value: TemporalMapPreimage): TemporalMapPoint {
  assertTemporalMapPreimage(value);
  assert(value.regions.length === 1, value.regions.length === 0
    ? "Temporal Map preimage has no solution; exactly one point is required."
    : `Temporal Map preimage has ${value.regions.length} regions; exactly one point is required.`);
  const [region] = value.regions;
  assert(compareMapPoints(region!.start, region!.end) === 0,
    "Temporal Map preimage is a region; exactly one point is required.");
  return structuredClone(region!.start);
}

export const uniqueTemporalMapRegionSetPoint = uniqueTemporalMapPreimagePoint;

type StructuralRegion =
  | { readonly kind: "range"; readonly start: ExactTemporalValue; readonly end: ExactTemporalValue }
  | { readonly kind: "point"; readonly at: ExactTemporalValue };

function overlappingPieces(stage: TemporalMapStage, region: StructuralRegion): readonly {
  readonly piece: TemporalMapPiece;
  readonly start: ExactTemporalValue;
  readonly end: ExactTemporalValue;
}[] {
  if (region.kind === "point") {
    const pieces = [stagePiece(stage, region.at, "before"), stagePiece(stage, region.at, "after")]
      .filter((piece, index, all): piece is TemporalMapPiece => piece !== undefined && all.indexOf(piece) === index);
    return pieces.map((piece) => ({ piece, start: region.at, end: region.at }));
  }
  return stage.pieces.flatMap((piece) => {
    if (compareExactTemporalValues(piece.target.start, region.end) >= 0
      || compareExactTemporalValues(piece.target.end, region.start) <= 0) return [];
    return [{
      piece,
      start: compareExactTemporalValues(piece.target.start, region.start) > 0
        ? piece.target.start : region.start,
      end: compareExactTemporalValues(piece.target.end, region.end) < 0
        ? piece.target.end : region.end,
    }];
  });
}

function sourceRegion(
  piece: TemporalMapPiece,
  start: ExactTemporalValue,
  end: ExactTemporalValue,
): StructuralRegion {
  if (isAffineTemporalMapPiece(piece) && piece.wrap !== undefined) {
    return { kind: "range", start: piece.wrap.start, end: piece.wrap.end };
  }
  const left = pieceValue(piece, start);
  const right = pieceValue(piece, end);
  const order = compareExactTemporalValues(left, right);
  if (order === 0) return { kind: "point", at: left };
  return order < 0
    ? { kind: "range", start: left, end: right }
    : { kind: "range", start: right, end: left };
}

function stagesMayContain(
  stages: readonly TemporalMapStage[],
  index: number,
  region: StructuralRegion,
): boolean {
  const overlaps = overlappingPieces(stages[index]!, region);
  if (overlaps.length === 0) return false;
  if (index === stages.length - 1) return true;
  return overlaps.some(({ piece, start, end }) =>
    stagesMayContain(stages, index + 1, sourceRegion(piece, start, end)));
}

/**
 * Conservatively answer whether any content relation crosses a target interval.
 *
 * This walks piece support and source envelopes; it never samples a frame or audio grid. Wrapped
 * pieces deliberately propagate their complete wrap interval, so `true` may prepare more source
 * data than a particular discrete clock reads, while `false` proves the whole interval is a gap.
 */
export function temporalMapMayContain(value: TemporalMap, target: TemporalRange): boolean {
  assertTemporalMap(value);
  if (compareExactTemporalValues(target.start, target.end) >= 0) return false;
  return stagesMayContain(value.stages, 0, { kind: "range", start: target.start, end: target.end });
}
