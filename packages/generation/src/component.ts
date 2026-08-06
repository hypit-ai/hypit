import type { HostRegistry } from "@svml/driver-node";
import type { TypeValidatorRegistrar } from "@svml/validation";

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
  install(_registry: HostRegistry): void {},
  installValidators(registry: TypeValidatorRegistrar): void {
    registry.register(generationTypes.imageSet, generationValidatorDigests.imageSet, ({ value }) => {
      verifyGeneratedImageSet(inline(value, "GeneratedImageSet"));
    });
    registry.register(generationTypes.videoSet, generationValidatorDigests.videoSet, ({ value }) => {
      verifyGeneratedVideoSet(inline(value, "GeneratedVideoSet"));
    });
  },
};
