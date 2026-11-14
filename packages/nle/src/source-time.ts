import {
  addExactTemporalValues,
  assertTemporalMapPieces,
  coalesceTemporalMapPieces,
  compareExactTemporalValues,
  exactTemporalZero,
  extrapolateTemporalAffineMapPiece,
  extrapolateTemporalMapPieceRange,
  isAffineTemporalMapPiece,
  sealLocalTemporalDomain,
  sliceTemporalMapPieces,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type TemporalMapPiece,
  type TemporalRange,
  type TemporalRate,
} from "@hypit/temporal/algebra";

import type { NleTimeMapping } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const unitRate = { numerator: 1, denominator: 1 } as const;

function domain(duration: ExactTemporalValue) {
  return sealLocalTemporalDomain({ id: "nle-source-time", duration: structuredClone(duration) });
}

export function assertNleTimeMapping(
  value: NleTimeMapping,
  duration: ExactTemporalValue,
  label = "NLE source time",
): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert(Object.keys(value).length === 1 && Array.isArray(value.pieces), `${label} must contain only pieces.`);
  assertTemporalMapPieces(value.pieces, domain(duration));
}

export function nleLinearTimeMapping(
  duration: ExactTemporalValue,
  sourceAtStart: ExactTemporalValue = exactTemporalZero(),
  rate: TemporalRate = unitRate,
  wrap?: TemporalRange,
): NleTimeMapping {
  const value: NleTimeMapping = {
    pieces: [{
      target: { start: exactTemporalZero(), end: structuredClone(duration) },
      sourceAtStart: structuredClone(sourceAtStart),
      rate: structuredClone(rate),
      ...(wrap === undefined ? {} : { wrap: structuredClone(wrap) }),
    }],
  };
  assertNleTimeMapping(value, duration);
  return value;
}

function maximum(left: ExactTemporalValue, right: ExactTemporalValue): ExactTemporalValue {
  return compareExactTemporalValues(left, right) >= 0 ? left : right;
}

/** Minimum resolved Source duration required to contain every persisted source coordinate. */
export function nleTimeMappingRequiredDuration(value: NleTimeMapping): ExactTemporalValue {
  let result = exactTemporalZero();
  for (const piece of value.pieces) {
    if (isAffineTemporalMapPiece(piece)) {
      result = maximum(result, piece.sourceAtStart);
      result = maximum(result, piece.wrap?.end
        ?? extrapolateTemporalAffineMapPiece(piece, piece.target.end));
      continue;
    }
    for (const position of [
      piece.sourceAtStart,
      piece.sourceControl1,
      piece.sourceControl2,
      piece.sourceAtEnd,
    ]) result = maximum(result, position);
  }
  return structuredClone(result);
}

function shiftPiece(piece: TemporalMapPiece, delta: ExactTemporalValue): TemporalMapPiece {
  if (isAffineTemporalMapPiece(piece)) {
    return {
      ...structuredClone(piece),
      sourceAtStart: addExactTemporalValues(piece.sourceAtStart, delta),
      ...(piece.wrap === undefined ? {} : { wrap: {
        start: addExactTemporalValues(piece.wrap.start, delta),
        end: addExactTemporalValues(piece.wrap.end, delta),
      } }),
    };
  }
  return {
    ...structuredClone(piece),
    sourceAtStart: addExactTemporalValues(piece.sourceAtStart, delta),
    sourceControl1: addExactTemporalValues(piece.sourceControl1, delta),
    sourceControl2: addExactTemporalValues(piece.sourceControl2, delta),
    sourceAtEnd: addExactTemporalValues(piece.sourceAtEnd, delta),
  };
}

export function shiftNleTimeMapping(
  value: NleTimeMapping,
  duration: ExactTemporalValue,
  delta: ExactTemporalValue,
): NleTimeMapping {
  const shifted = { pieces: value.pieces.map((piece) => shiftPiece(piece, delta)) };
  assertNleTimeMapping(shifted, duration);
  return shifted;
}

function boundaryPiece(
  pieces: readonly TemporalMapPiece[],
  at: ExactTemporalValue,
  edge: "start" | "end",
): TemporalMapPiece {
  const piece = edge === "start"
    ? pieces.find((candidate) => compareExactTemporalValues(candidate.target.start, at) === 0)
    : pieces.findLast((candidate) => compareExactTemporalValues(candidate.target.end, at) === 0);
  assert(piece !== undefined, `NLE source-time ${edge} boundary is a gap and cannot be extended.`);
  return piece;
}

function extension(
  piece: TemporalMapPiece,
  start: ExactTemporalValue,
  end: ExactTemporalValue,
  rebase: ExactTemporalValue,
): TemporalMapPiece {
  return {
    ...extrapolateTemporalMapPieceRange(piece, { start, end }),
    target: {
      start: subtractExactTemporalValues(start, rebase),
      end: subtractExactTemporalValues(end, rebase),
    },
  };
}

/** Select an Item-local range, exactly subdividing pieces and rebasing its start to zero. */
export function sliceNleTimeMapping(
  value: NleTimeMapping,
  oldDuration: ExactTemporalValue,
  range: TemporalRange,
): NleTimeMapping {
  assert(compareExactTemporalValues(range.start, range.end) < 0, "NLE source-time slice must be positive.");
  const zero = exactTemporalZero();
  const pieces: TemporalMapPiece[] = [];
  if (compareExactTemporalValues(range.start, zero) < 0) {
    const until = compareExactTemporalValues(range.end, zero) < 0 ? range.end : zero;
    if (compareExactTemporalValues(range.start, until) < 0) {
      pieces.push(extension(boundaryPiece(value.pieces, zero, "start"), range.start, until, range.start));
    }
  }
  pieces.push(...sliceTemporalMapPieces(value.pieces, range));
  if (compareExactTemporalValues(range.end, oldDuration) > 0) {
    const from = compareExactTemporalValues(range.start, oldDuration) > 0 ? range.start : oldDuration;
    if (compareExactTemporalValues(from, range.end) < 0) {
      pieces.push(extension(boundaryPiece(value.pieces, oldDuration, "end"), from, range.end, range.start));
    }
  }
  const duration = subtractExactTemporalValues(range.end, range.start);
  const sliced = { pieces: coalesceTemporalMapPieces(pieces) };
  assertNleTimeMapping(sliced, duration);
  return sliced;
}
