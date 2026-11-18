import {
  compareExactTemporalValues,
  exactTemporalRational,
  exactTemporalValue,
  exactTemporalZero,
  scaleExactTemporalValue,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type TemporalAffineMapPiece,
  type TemporalRange,
  type TemporalRate,
} from "@hypit/temporal/algebra";
import { nleTimeMappingRequiredDuration, sliceNleTimeMapping } from "./source-time.js";
import type { NleProcessControlTime, NleTimeMapping } from "./types.js";

type EdgeControlTime = Extract<NleProcessControlTime, { readonly edge: string }>;

export function nleProcessControlDuration(time: NleProcessControlTime): ExactTemporalValue {
  if ("edge" in time) return time.controlDuration;
  return time.controlDuration ?? nleTimeMappingRequiredDuration(time);
}

function controlRate(time: EdgeControlTime): TemporalRate {
  const control = exactTemporalRational(time.controlDuration);
  const placement = exactTemporalRational(time.duration);
  const ratio = exactTemporalValue({
    numerator: control.numerator * placement.denominator,
    denominator: control.denominator * placement.numerator,
  });
  const numerator = Number(ratio.ticks);
  if (!Number.isSafeInteger(numerator)) throw new Error("NLE Control rate exceeds the exact rate representation.");
  return { numerator, denominator: ratio.timeBase.denominator };
}

/** Resolve visible Item-local positions into the stable Control domain. */
export function resolveNleProcessTime(time: NleProcessControlTime, itemDuration: ExactTemporalValue): NleTimeMapping {
  if ("pieces" in time) return { pieces: time.pieces };

  const zero = exactTemporalZero();
  const wholeItem = compareExactTemporalValues(time.duration, itemDuration) >= 0;
  const visibleDuration = wholeItem ? itemDuration : time.duration;
  const fromStart = time.edge === "start";
  const start = fromStart ? zero : subtractExactTemporalValues(itemDuration, visibleDuration);
  const end = fromStart ? visibleDuration : itemDuration;
  const rate = controlRate(time);
  const sourceAtStart = fromStart ? zero
    : scaleExactTemporalValue(subtractExactTemporalValues(time.duration, visibleDuration), rate);
  const pieces: TemporalAffineMapPiece[] = [{ target: { start, end }, sourceAtStart, rate }];
  const hold = { numerator: 0, denominator: 1 };
  if (!wholeItem && fromStart) {
    pieces.push({ target: { start: end, end: itemDuration }, sourceAtStart: time.controlDuration, rate: hold });
  }
  if (!wholeItem && !fromStart) {
    pieces.unshift({ target: { start: zero, end: start }, sourceAtStart: zero, rate: hold });
  }
  return { pieces };
}

/** Keep alignment on the fragment with its original edge and slice the other fragment's resolved curve. */
export function sliceNleProcessTime(
  time: NleProcessControlTime,
  itemDuration: ExactTemporalValue,
  range: TemporalRange,
  splitFragment?: "start" | "end",
): NleProcessControlTime {
  if ("edge" in time && (splitFragment === undefined || splitFragment === time.edge)) return time;
  const mapping = sliceNleTimeMapping(resolveNleProcessTime(time, itemDuration), itemDuration, range,
    time.controlDuration !== undefined);
  return time.controlDuration === undefined ? mapping : { ...mapping, controlDuration: time.controlDuration };
}
