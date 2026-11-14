import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import { mediaDependency, mediaTypes } from "@hypit/media";
import type { GenerationModuleDefinition } from "@hypit/generation-build";
import type { ProducerRef } from "@hypit/module";

export const mediaAvirAuthorModuleRef = {
  name: "@hypit/media-avir-author",
} as const;

export const mediaAvirAuthorProducers = {
  source: { module: mediaAvirAuthorModuleRef, name: "prepared-media-source" },
} satisfies Record<string, ProducerRef>;

export const mediaAvirAuthorManifest: GenerationModuleDefinition = {
  name: mediaAvirAuthorModuleRef.name,
  dependencies: [audiovisualDependency, mediaDependency],
  types: [],
  capabilities: [],
  producers: [{
    name: mediaAvirAuthorProducers.source.name,
    inputs: [{ name: "media", type: mediaTypes.prepared }],
    result: { kind: "output", name: "source", type: audiovisualTypes.programSource },
  }],
};

export const mediaAvirAuthorDependency = mediaAvirAuthorModuleRef;
