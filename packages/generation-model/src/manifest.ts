import { blobDependency, blobTypes, } from "@hypit/blob";
import type { TypeRef } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";
import type { ProducerRef } from "@hypit/module";

export const generationModuleRef = { name: "@hypit/generation-model" } as const;
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

export const generationManifest: GenerationModuleDefinition = {
  name: generationModuleRef.name,
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
