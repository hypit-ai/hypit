import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";

import { pictureFilterProducers, pictureFilterTypes } from "./manifest.js";
import {
  assertPictureFilterControl,
  assertPictureFilterState,
  pictureFilterControlOperator,
  pictureFilterOperator,
  type PictureFilterControl,
  type PictureFilterState,
} from "./program.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const pictureFilterComponent = {
  producers: [
    {
      producer: pictureFilterProducers.operator,
      handler: ({ inputs }) => ({
        kind: "output" as const,
        value: canonicalize(pictureFilterOperator(
          valueOf<PictureFilterState>(inputs.state?.value, "PictureFilterState"),
        )),
      }),
    },
    {
      producer: pictureFilterProducers.controlOperator,
      handler: ({ inputs }) => ({
        kind: "output" as const,
        value: canonicalize(pictureFilterControlOperator(
          valueOf<PictureFilterControl>(inputs.control?.value, "PictureFilterControl"),
        )),
      }),
    },
  ],
  refinements: [
    {
      type: pictureFilterTypes.state,
      handler: ({ value }) => {
        assertPictureFilterState(valueOf<PictureFilterState>(value, "PictureFilterState"));
      },
    },
    {
      type: pictureFilterTypes.control,
      handler: ({ value }) => {
        assertPictureFilterControl(valueOf<PictureFilterControl>(value, "PictureFilterControl"));
      },
    },
  ],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
