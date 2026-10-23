import {
  blobDependency,
  blobTypes,
} from "@hypit/hypit/blob";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";

import { generatedAudioSetSchema, generatedImageSetSchema, generatedVideoSetSchema } from "./schema.js";

export const generationModuleRef = { name: "@hypit/generation", version: "1" } as const;
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
  format: "hypit.module@1",
  name: generationModuleRef.name,
  version: generationModuleRef.version,
  dependencies: [blobDependency],
  types: [
    generationTypes.audioSet.name,
    generationTypes.imageSet.name,
    generationTypes.videoSet.name,
  ],
  capabilities: [],
  producers: [
    {
      name: generationProducers.primaryAudio.name,
      inputs: [{ name: "set", type: generationTypes.audioSet }],
      result: { kind: "output" as const, name: "audio", type: blobTypes.blob },
    },
    {
      name: generationProducers.primaryImage.name,
      inputs: [{ name: "set", type: generationTypes.imageSet }],
      result: { kind: "output" as const, name: "image", type: blobTypes.blob },
    },
    {
      name: generationProducers.primaryVideo.name,
      inputs: [{ name: "set", type: generationTypes.videoSet }],
      result: { kind: "output" as const, name: "video", type: blobTypes.blob },
    },
  ],
};
