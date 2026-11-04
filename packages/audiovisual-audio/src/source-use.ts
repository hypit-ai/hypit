import { occurrenceParentRange } from "@hypit/audiovisual";
import type { Occurrence } from "@hypit/audiovisual";
import {
  composeTemporalMaps,
  exactTemporalZero,
  sealLocalTemporalDomain,
  sealTemporalMap,
  subtractExactTemporalValues,
} from "@hypit/temporal/algebra";

/** Close one active occurrence range into a target-local to Source-local relation. */
export function occurrenceAudioProgramUse(context: {
  readonly id: string;
  readonly occurrence: Occurrence;
  readonly output: string;
}) {
  const selection = context.occurrence.selections[context.output];
  if (selection === undefined) {
    throw new Error(`Occurrence ${context.occurrence.id} has no Selection for output ${context.output}.`);
  }
  if (selection.kind !== "signal") {
    throw new Error(`Occurrence ${context.occurrence.id}.${context.output} is constant and cannot lower as continuous Audio.`);
  }
  const active = context.occurrence.placement.active;
  const duration = subtractExactTemporalValues(active.end, active.start);
  const local = sealLocalTemporalDomain({ id: `${context.id}:active`, duration });
  const zero = exactTemporalZero();
  const activeToOccurrence = sealTemporalMap({ stages: [{
    target: local,
    source: context.occurrence.domain,
    pieces: [{
      target: { start: zero, end: duration },
      sourceAtStart: active.start,
      rate: { numerator: 1, denominator: 1 },
    }],
  }] });
  return {
    target: occurrenceParentRange(context.occurrence),
    sampling: composeTemporalMaps(activeToOccurrence, selection.mapping),
    ...(selection.reconstruction === undefined ? {} : {
      reconstruction: structuredClone(selection.reconstruction.program),
    }),
  };
}
