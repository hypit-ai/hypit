import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { LocalTemporalDomain } from "@hypit/temporal/algebra";

import { visualTreatmentProducers, visualTreatmentTypes } from "./manifest.js";
import { assertTreatmentOperatorSpec, treatmentOperator, type TreatmentOperatorSpec } from "./program.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const visualTreatmentComponent = {
  producers: [{
    producer: visualTreatmentProducers.operator,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(treatmentOperator(
      valueOf<TreatmentOperatorSpec>(inputs.spec?.value, "VisualTreatmentOperatorSpec"),
      valueOf<LocalTemporalDomain>(inputs.domain?.value, "VisualTreatment Control Domain"),
    )) }),
  }],
  refinements: [{
    type: visualTreatmentTypes.operatorSpec,
    handler: ({ value }) => {
      const spec = valueOf<TreatmentOperatorSpec>(value, "VisualTreatmentOperatorSpec");
      assertTreatmentOperatorSpec(spec);
    },
  }],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
