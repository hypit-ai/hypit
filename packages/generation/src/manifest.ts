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

export const generationProducers = {
  primaryAudio: { module: generationModuleRef, name: "select-primary-audio" },
  primaryImage: { module: generationModuleRef, name: "select-primary-image" },
  primaryVideo: { module: generationModuleRef, name: "select-primary-video" },
} satisfies Record<string, ProducerRef>;

export const generationManifest: ModuleManifest = {
  format: "narratage.module@1",
  name: generationModuleRef.name,
  version: generationModuleRef.version,
  dependencies: [artifactDependency],
  types: [
    {
      name: generationTypes.audioSet.name,
    },
    {
      name: generationTypes.imageSet.name,
    },
    {
      name: generationTypes.videoSet.name,
    },
  ],
  capabilities: [],
  producers: [
    {
      name: generationProducers.primaryAudio.name,
      inputs: [{ name: "set", type: generationTypes.audioSet }],
      outputs: [{ name: "audio", type: artifactTypes.blob }],
      needs: [],
    },
    {
      name: generationProducers.primaryImage.name,
      inputs: [{ name: "set", type: generationTypes.imageSet }],
      outputs: [{
        name: "image",
        type: artifactTypes.blob,
      }],
      needs: [],
    },
    {
      name: generationProducers.primaryVideo.name,
      inputs: [{ name: "set", type: generationTypes.videoSet }],
      outputs: [{
        name: "video",
        type: artifactTypes.blob,
      }],
      needs: [],
    },
  ],
};
