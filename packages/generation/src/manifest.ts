import {
  artifactDependency,
  artifactTypes,
} from "@svml/artifact";
import { digestOf } from "@svml/protocol";
import type { ModuleManifest, ProducerRef, TypeRef } from "@svml/protocol";

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

export const generationProducers = {
  primaryImage: { module: generationModuleRef, name: "select-primary-image" },
  primaryVideo: { module: generationModuleRef, name: "select-primary-video" },
} satisfies Record<string, ProducerRef>;

export const generationProducerDigests = {
  primaryImage: digestOf("@svml/generation/select-primary-image@1"),
  primaryVideo: digestOf("@svml/generation/select-primary-video@1"),
} as const;

export const generationManifest: ModuleManifest = {
  format: "svml.module@1",
  name: generationModuleRef.name,
  version: generationModuleRef.version,
  dependencies: [artifactDependency],
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
  producers: [
    {
      name: generationProducers.primaryImage.name,
      inputs: [{ name: "set", type: generationTypes.imageSet }],
      outputs: [{
        name: "image",
        type: artifactTypes.blob,
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/generation/select-primary-image",
        digest: generationProducerDigests.primaryImage,
      },
    },
    {
      name: generationProducers.primaryVideo.name,
      inputs: [{ name: "set", type: generationTypes.videoSet }],
      outputs: [{
        name: "video",
        type: artifactTypes.blob,
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/generation/select-primary-video",
        digest: generationProducerDigests.primaryVideo,
      },
    },
  ],
};

export const generationManifestDigest = digestOf(generationManifest);
