import { canonicalize } from "@hypit/protocol";
import type { Value } from "@hypit/protocol";
import type { ProducerPackage } from "@hypit/producer";
import type { RefinementPackage } from "@hypit/refinement";
import type { LocalTemporalDomain } from "@hypit/temporal/algebra";

import { pictureTransitionProducers, pictureTransitionTypes } from "./manifest.js";
import { assertTransitionOperatorSpec, transitionOperator, type TransitionOperatorSpec } from "./program.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const pictureTransitionComponent = {
  producers: [{
    producer: pictureTransitionProducers.operator,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(transitionOperator(
      valueOf<TransitionOperatorSpec>(inputs.spec?.value, "PictureTransitionOperatorSpec"),
      valueOf<LocalTemporalDomain>(inputs.domain?.value, "PictureTransition Control Domain"),
    )) }),
  }],
  refinements: [{
    type: pictureTransitionTypes.operatorSpec,
    handler: ({ value }) => {
      const spec = valueOf<TransitionOperatorSpec>(value, "PictureTransitionOperatorSpec");
      assertTransitionOperatorSpec(spec);
    },
  }],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
