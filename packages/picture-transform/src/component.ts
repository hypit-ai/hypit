import type { ProducerPackage } from "@hypit/producer";
import { canonicalize, type Value } from "@hypit/protocol";
import type { RefinementPackage } from "@hypit/refinement";

import { pictureTransformProducers, pictureTransformTypes } from "./manifest.js";
import {
  assertPictureTransformControl,
  assertPictureTransformState,
  pictureTransformControlOperator,
  pictureTransformOperator,
  type PictureTransformControl,
  type PictureTransformState,
} from "./program.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const pictureTransformComponent = {
  producers: [
    {
      producer: pictureTransformProducers.operator,
      handler: ({ inputs }) => ({
        kind: "output" as const,
        value: canonicalize(pictureTransformOperator(
          valueOf<PictureTransformState>(inputs.state?.value, "PictureTransformState"),
        )),
      }),
    },
    {
      producer: pictureTransformProducers.controlOperator,
      handler: ({ inputs }) => ({
        kind: "output" as const,
        value: canonicalize(pictureTransformControlOperator(
          valueOf<PictureTransformControl>(inputs.control?.value, "PictureTransformControl"),
        )),
      }),
    },
  ],
  refinements: [
    {
      type: pictureTransformTypes.state,
      handler: ({ value }) => assertPictureTransformState(
        valueOf<PictureTransformState>(value, "PictureTransformState"),
      ),
    },
    {
      type: pictureTransformTypes.control,
      handler: ({ value }) => assertPictureTransformControl(
        valueOf<PictureTransformControl>(value, "PictureTransformControl"),
      ),
    },
  ],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
