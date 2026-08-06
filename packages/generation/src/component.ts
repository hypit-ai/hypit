import type { ComponentPackage } from "@svml/component-kit";

import {
  verifyGeneratedImageSet,
  verifyGeneratedVideoSet,
} from "./identity.js";
import {
  generationTypes,
  generationValidatorDigests,
} from "./manifest.js";

function inline(value: { readonly kind: string; readonly value?: unknown }, subject: string): unknown {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}

/** Host-side semantic refinements for the shared generated-media contracts. */
export const generationComponent = {
  name: "@svml/generation",
  validators: [
    {
      type: generationTypes.imageSet,
      implementationDigest: generationValidatorDigests.imageSet,
      handler: ({ value }) => {
        verifyGeneratedImageSet(inline(value, "GeneratedImageSet"));
      },
    },
    {
      type: generationTypes.videoSet,
      implementationDigest: generationValidatorDigests.videoSet,
      handler: ({ value }) => {
        verifyGeneratedVideoSet(inline(value, "GeneratedVideoSet"));
      },
    },
  ],
} satisfies ComponentPackage;
