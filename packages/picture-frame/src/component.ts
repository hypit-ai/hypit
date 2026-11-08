import type { ProducerPackage } from "@hypit/producer";
import { canonicalize, type Value } from "@hypit/protocol";
import type { RefinementPackage } from "@hypit/refinement";

import { pictureFrameProducers, pictureFrameTypes } from "./manifest.js";
import { assertPictureFrameTreatment, pictureFrameOperator, type PictureFrameTreatment } from "./program.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const pictureFrameComponent = {
  producers: [{
    producer: pictureFrameProducers.operator,
    handler: ({ inputs }) => ({
      kind: "output" as const,
      value: canonicalize(pictureFrameOperator(
        valueOf<PictureFrameTreatment>(inputs.treatment?.value, "PictureFrameTreatment"),
      )),
    }),
  }],
  refinements: [{
    type: pictureFrameTypes.treatment,
    handler: ({ value }) => assertPictureFrameTreatment(
      valueOf<PictureFrameTreatment>(value, "PictureFrameTreatment"),
    ),
  }],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
