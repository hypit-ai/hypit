import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";

import { pictureMatteProducers, pictureMatteTypes } from "./manifest.js";
import { pictureMatteOperator, type PictureMatteOperatorSpec } from "./program.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

function operator(value: Value | undefined) {
  const spec = valueOf<PictureMatteOperatorSpec>(value, "PictureMatteOperatorSpec");
  return pictureMatteOperator(spec.channel, spec.invert);
}

export const pictureMatteComponent = {
  producers: [{
    producer: pictureMatteProducers.operator,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(operator(inputs.spec?.value)) }),
  }],
  refinements: [{
    type: pictureMatteTypes.operatorSpec,
    handler: ({ value }) => { operator(value); },
  }],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
