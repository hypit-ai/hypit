import { digestOf } from "@svml/protocol";
import type { ModuleManifest, TypeRef } from "@svml/protocol";

import { generatedImageSetSchema, generatedVideoSetSchema } from "./schema.js";

export const generationModuleRef = { name: "@svml/generation", version: "0.0.0-dev" } as const;
export const generationTypes = {
  imageSet: { module: generationModuleRef, name: "GeneratedImageSet" },
  videoSet: { module: generationModuleRef, name: "GeneratedVideoSet" },
} satisfies Record<string, TypeRef>;

export const generationValidatorDigests = {
  imageSet: digestOf("@svml/generation/validate-generated-image-set@1"),
  videoSet: digestOf("@svml/generation/validate-generated-video-set@1"),
};

export const generationManifest: ModuleManifest = {
  format: "svml.module@0",
  name: generationModuleRef.name,
  version: generationModuleRef.version,
  dependencies: [],
  types: [
    {
      name: generationTypes.imageSet.name,
      schema: generatedImageSetSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@svml/generation/validate-generated-image-set",
          digest: generationValidatorDigests.imageSet,
        },
      },
    },
    {
      name: generationTypes.videoSet.name,
      schema: generatedVideoSetSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@svml/generation/validate-generated-video-set",
          digest: generationValidatorDigests.videoSet,
        },
      },
    },
  ],
  capabilities: [],
  surfaces: [],
  producers: [],
};

export const generationManifestDigest = digestOf(generationManifest);
