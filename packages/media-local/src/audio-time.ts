import {
  addExactTemporalValues, assertTemporalMap, coalesceTemporalMapPieces, compareExactTemporalValues, exactTemporalValue,
  extrapolateTemporalAffineMapPiece, isAffineTemporalMapPiece, scaleExactTemporalValue, subtractExactTemporalValues,
  type ExactTemporalValue, type TemporalAffineMapPiece, type TemporalMap, type TemporalRange, type TemporalRate,
} from "@hypit/temporal/algebra";

const unit = { numerator: 1, denominator: 1 };

function multiplyRates(left: TemporalRate, right: TemporalRate): TemporalRate {
  const product = exactTemporalValue({
    numerator: BigInt(left.numerator) * BigInt(right.numerator),
    denominator: BigInt(left.denominator) * BigInt(right.denominator),
  });
  const numerator = Number(product.ticks);
  if (!Number.isSafeInteger(numerator)) throw new Error("Composed Audio rate exceeds the exact local range.");
  return { numerator, denominator: product.timeBase.denominator };
}

function intersect(left: TemporalRange, right: TemporalRange): TemporalRange | undefined {
  const start = compareExactTemporalValues(left.start, right.start) >= 0 ? left.start : right.start;
  const end = compareExactTemporalValues(left.end, right.end) <= 0 ? left.end : right.end;
  if (compareExactTemporalValues(start, end) < 0) return { start, end };
}

function pullback(
  segment: TemporalAffineMapPiece,
  pieces: readonly TemporalAffineMapPiece[],
): readonly TemporalAffineMapPiece[] {
  const { rate, target, sourceAtStart } = segment;
  if (rate.numerator === 0) {
    const piece = pieces.find(({ target }) => compareExactTemporalValues(sourceAtStart, target.start) >= 0
      && compareExactTemporalValues(sourceAtStart, target.end) < 0);
    return piece === undefined ? [] : [{ ...segment, sourceAtStart: extrapolateTemporalAffineMapPiece(piece, sourceAtStart) }];
  }

  const reversed = rate.numerator < 0;
  const sourceEnd = extrapolateTemporalAffineMapPiece(segment, target.end);
  const covered = reversed ? { start: sourceEnd, end: sourceAtStart } : { start: sourceAtStart, end: sourceEnd };
  const inverse = { numerator: reversed ? -rate.denominator : rate.denominator, denominator: Math.abs(rate.numerator) };
  const toTarget = (time: ExactTemporalValue) => addExactTemporalValues(target.start,
    scaleExactTemporalValue(subtractExactTemporalValues(time, sourceAtStart), inverse));
  const result: TemporalAffineMapPiece[] = [];
  for (const piece of reversed ? [...pieces].reverse() : pieces) {
    const intersection = intersect(covered, piece.target);
    if (intersection === undefined) continue;
    const start = reversed ? intersection.end : intersection.start;
    const end = reversed ? intersection.start : intersection.end;
    result.push({
      target: { start: toTarget(start), end: toTarget(end) },
      sourceAtStart: extrapolateTemporalAffineMapPiece(piece, start),
      rate: multiplyRates(rate, piece.rate),
    });
  }
  return result;
}

/** Close the supported piecewise-affine relation before quantizing PCM boundaries or emitting filter expressions. */
export function audioTimeSegments(map: TemporalMap, target: TemporalRange, subject: string): readonly TemporalAffineMapPiece[] {
  try {
    assertTemporalMap(map);
    let segments: readonly TemporalAffineMapPiece[] = [{ target, sourceAtStart: target.start, rate: unit }];
    for (const stage of map.stages) {
      const pieces = stage.pieces.map(piece => {
        if (!isAffineTemporalMapPiece(piece) || piece.wrap !== undefined) {
          throw new Error("requires unwrapped affine time pieces.");
        }
        return piece;
      });
      segments = segments.flatMap(segment => pullback(segment, pieces));
    }
    return coalesceTemporalMapPieces(segments) as readonly TemporalAffineMapPiece[];
  } catch (error) {
    throw new Error(`${subject} ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** FFmpeg's bounded tempo factors preserve pitch for positive constant-speed reads. */
export function audioTempo(numerator: number, denominator: number): string[] {
  if (numerator === denominator) return [];
  let remaining = numerator / denominator;
  const filters: string[] = [];
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  if (remaining !== 1) filters.push(`atempo=${remaining.toPrecision(15)}`);
  return filters;
}
