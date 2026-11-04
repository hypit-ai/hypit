import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";

import { visualMatteProducers, visualMatteTypes } from "./manifest.js";
import { visualMatteOperator, type VisualMatteOperatorSpec } from "./program.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

function operator(value: Value | undefined) {
  const spec = valueOf<VisualMatteOperatorSpec>(value, "VisualMatteOperatorSpec");
  return visualMatteOperator(spec.channel, spec.invert);
}

export const visualMatteComponent = {
  producers: [{
    producer: visualMatteProducers.operator,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(operator(inputs.spec?.value)) }),
  }],
  refinements: [{
    type: visualMatteTypes.operatorSpec,
    handler: ({ value }) => { operator(value); },
  }],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
