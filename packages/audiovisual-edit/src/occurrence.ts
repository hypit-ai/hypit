import {
  assertOccurrence,
  sealOccurrence,
  type Occurrence,
} from "@hypit/audiovisual";
import {
  addExactTemporalValues,
  assertExactTemporalValue,
  assertTemporalMap,
  compareExactTemporalValues,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type TemporalMap,
  type TemporalRange,
} from "@hypit/temporal/algebra";

import type { SplitOccurrenceOptions } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function assertRange(range: TemporalRange, occurrence: Occurrence, label: string): void {
  assertExactTemporalValue(range.start, `${label}.start`);
  assertExactTemporalValue(range.end, `${label}.end`);
  assert(compareExactTemporalValues(range.start, range.end) < 0, `${label} must be non-empty.`);
  assert(compareExactTemporalValues(range.start,
    { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }) >= 0
    && compareExactTemporalValues(range.end, occurrence.domain.duration) <= 0,
  `${label} lies outside domain ${occurrence.domain.id}.`);
}

export function moveOccurrence(value: Occurrence, start: ExactTemporalValue): Occurrence {
  assertOccurrence(value);
  assertExactTemporalValue(start, "Occurrence move start");
  return sealOccurrence({
    ...structuredClone(value),
    placement: { ...structuredClone(value.placement), start: structuredClone(start) },
  });
}

export function trimOccurrence(value: Occurrence, active: TemporalRange): Occurrence {
  assertOccurrence(value);
  assertRange(active, value, "Occurrence trim range");
  const leadingDelta = subtractExactTemporalValues(active.start, value.placement.active.start);
  return sealOccurrence({
    ...structuredClone(value),
    placement: {
      ...structuredClone(value.placement),
      start: addExactTemporalValues(value.placement.start, leadingDelta),
      active: structuredClone(active),
    },
  });
}

export function remapOccurrence(value: Occurrence, output: string, mapping: TemporalMap): Occurrence {
  assertOccurrence(value);
  assertIdentity(output, "Occurrence remap output");
  const selection = value.selections[output];
  assert(selection !== undefined, `Occurrence ${value.id} does not select Source output ${output}.`);
  assert(selection.kind === "signal", `Occurrence ${value.id}.${output} is constant and cannot be remapped.`);
  assertTemporalMap(mapping);
  return sealOccurrence({
    ...structuredClone(value),
    selections: {
      ...structuredClone(value.selections),
      [output]: { ...structuredClone(selection), mapping: structuredClone(mapping) },
    },
  });
}

export function splitOccurrence(
  value: Occurrence,
  options: SplitOccurrenceOptions,
): readonly [Occurrence, Occurrence] {
  assertOccurrence(value);
  assertIdentity(options.leftId, "Split left Occurrence id");
  assertIdentity(options.rightId, "Split right Occurrence id");
  assert(options.leftId !== options.rightId, "Split Occurrence ids must be distinct.");
  assertExactTemporalValue(options.at, "Occurrence split position");
  assert(compareExactTemporalValues(options.at, value.placement.active.start) > 0
    && compareExactTemporalValues(options.at, value.placement.active.end) < 0,
  "Occurrence split position must lie inside its active local range.");
  const left = trimOccurrence(value, { start: value.placement.active.start, end: options.at });
  const right = trimOccurrence(value, { start: options.at, end: value.placement.active.end });
  return [
    sealOccurrence({ ...left, id: options.leftId }),
    sealOccurrence({ ...right, id: options.rightId }),
  ];
}
