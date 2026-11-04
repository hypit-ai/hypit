import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { LocalTemporalDomain } from "@hypit/temporal/algebra";

import { visualTransitionProducers, visualTransitionTypes } from "./manifest.js";
import { assertTransitionOperatorSpec, transitionOperator, type TransitionOperatorSpec } from "./program.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const visualTransitionComponent = {
  producers: [{
    producer: visualTransitionProducers.operator,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(transitionOperator(
      valueOf<TransitionOperatorSpec>(inputs.spec?.value, "VisualTransitionOperatorSpec"),
      valueOf<LocalTemporalDomain>(inputs.domain?.value, "VisualTransition Control Domain"),
    )) }),
  }],
  refinements: [{
    type: visualTransitionTypes.operatorSpec,
    handler: ({ value }) => {
      const spec = valueOf<TransitionOperatorSpec>(value, "VisualTransitionOperatorSpec");
      assertTransitionOperatorSpec(spec);
    },
  }],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
