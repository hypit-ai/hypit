import {
  artifactDependency,
  artifactTypes,
} from "@narratage/artifact";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef } from "@narratage/protocol";

import { generatedAudioSetSchema, generatedImageSetSchema, generatedVideoSetSchema } from "./schema.js";

export const generationModuleRef = { name: "@narratage/generation", version: "1" } as const;
export const generationTypes = {
  audioSet: { module: generationModuleRef, name: "GeneratedAudioSet" },
  imageSet: { module: generationModuleRef, name: "GeneratedImageSet" },
  videoSet: { module: generationModuleRef, name: "GeneratedVideoSet" },
} satisfies Record<string, TypeRef>;

export const generationValidatorDigests = {
  audioSet: digestOf("@narratage/generation/validate-generated-audio-set@1"),
  imageSet: digestOf("@narratage/generation/validate-generated-image-set@1"),
  videoSet: digestOf("@narratage/generation/validate-generated-video-set@1"),
};

export const generationProducers = {
  primaryAudio: { module: generationModuleRef, name: "select-primary-audio" },
  primaryImage: { module: generationModuleRef, name: "select-primary-image" },
  primaryVideo: { module: generationModuleRef, name: "select-primary-video" },
} satisfies Record<string, ProducerRef>;

export const generationProducerDigests = {
  primaryAudio: digestOf("@narratage/generation/select-primary-audio@1"),
  primaryImage: digestOf("@narratage/generation/select-primary-image@1"),
  primaryVideo: digestOf("@narratage/generation/select-primary-video@1"),
} as const;

export const generationManifest: ModuleManifest = {
  format: "svml.module@1",
  name: generationModuleRef.name,
  version: generationModuleRef.version,
  dependencies: [artifactDependency],
  types: [
    {
      name: generationTypes.audioSet.name,
      schema: generatedAudioSetSchema,
      validator: {
        implementation: {
          digest: generationValidatorDigests.audioSet,
        },
      },
    },
    {
      name: generationTypes.imageSet.name,
      schema: generatedImageSetSchema,
      validator: {
        implementation: {
          digest: generationValidatorDigests.imageSet,
        },
      },
    },
    {
      name: generationTypes.videoSet.name,
      schema: generatedVideoSetSchema,
      validator: {
        implementation: {
          digest: generationValidatorDigests.videoSet,
        },
      },
    },
  ],
  capabilities: [],
  producers: [
    {
      name: generationProducers.primaryAudio.name,
      inputs: [{ name: "set", type: generationTypes.audioSet }],
      outputs: [{ name: "audio", type: artifactTypes.blob }],
      needs: [],
      implementation: {
        digest: generationProducerDigests.primaryAudio,
      },
    },
    {
      name: generationProducers.primaryImage.name,
      inputs: [{ name: "set", type: generationTypes.imageSet }],
      outputs: [{
        name: "image",
        type: artifactTypes.blob,
      }],
      needs: [],
      implementation: {
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
        digest: generationProducerDigests.primaryVideo,
      },
    },
  ],
};

export const generationManifestDigest = digestOf(generationManifest);
