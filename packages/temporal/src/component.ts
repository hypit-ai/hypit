import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import { temporalExtentFromDomain } from "./extent.js";
import { assertTemporalExtent } from "./extent.js";
import { assertExactTemporalValue } from "./exact.js";
import { assertLocalTemporalDomain } from "./domain.js";
import { assertTemporalMap } from "./map.js";
import { temporalProducers, temporalTypes } from "./index.js";
import type { LocalTemporalDomain } from "./types.js";
import { assertTemporalDuration } from "./validation.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

const output = (value: unknown) => ((canonicalize(value)));

export const temporalComponent = {
  refinements: [
    { type: temporalTypes.duration, handler: ({ value }) => assertTemporalDuration(value) },
    { type: temporalTypes.exactValue, handler: ({ value }) => assertExactTemporalValue(value as never) },
    { type: temporalTypes.extent, handler: ({ value }) => assertTemporalExtent(value as never) },
    { type: temporalTypes.map, handler: ({ value }) => assertTemporalMap(value as never) },
    { type: temporalTypes.localDomain, handler: ({ value }) => assertLocalTemporalDomain(value as never) },
  ],
  producers: [
    { producer: temporalProducers.extentFromDomain, handler: ({ inputs }) => ({ kind: "output", value: output(
      temporalExtentFromDomain(valueOf<LocalTemporalDomain>(inputs.domain?.value, "LocalTemporalDomain")),
    ) }) },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
