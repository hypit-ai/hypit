import {
  addExactTemporalValues, assertExactTemporalValue, compareExactTemporalValues, exactTemporalZero,
  subtractExactTemporalValues, type ExactTemporalValue, type TemporalRange,
} from "@hypit/temporal/algebra";
import type { MediaInterpretation } from "./types.js";

export type MediaSourceWindow = TemporalRange & { readonly duration: ExactTemporalValue };

/** Select an exact positive window on an accepted Media Asset's local clock. */
export function selectMediaSourceWindow(interpretation: MediaInterpretation, input: {
  readonly member: "picture" | "audio";
  readonly start?: ExactTemporalValue;
  readonly duration?: ExactTemporalValue;
  readonly label?: string;
}): MediaSourceWindow {
  const { domain } = interpretation;
  const label = input.label ?? "Media";
  const member = interpretation[input.member];
  if (!domain || !member || ("kind" in member && member.kind === "constant")) {
    throw new Error(`${label} requires a time-bearing ${input.member} member.`);
  }
  const zero = exactTemporalZero();
  const start = input.start ?? zero;
  assertExactTemporalValue(start, `${label} source start`);
  if (input.duration !== undefined) assertExactTemporalValue(input.duration, `${label} source duration`);
  const end = input.duration === undefined ? domain.duration : addExactTemporalValues(start, input.duration);
  if (compareExactTemporalValues(start, zero) < 0 || compareExactTemporalValues(start, end) >= 0
    || compareExactTemporalValues(end, domain.duration) > 0) {
    throw new Error(`${label} source window must have positive duration within the media-local domain.`);
  }
  return { start, end, duration: input.duration ?? subtractExactTemporalValues(end, start) };
}
