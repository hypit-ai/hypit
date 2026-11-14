import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { GenerationModuleDefinition } from "@hypit/generation-build";
import type { ProducerRef } from "@hypit/module";

export const audioPreservePitchModuleRef = { name: "@hypit/audio-preserve-pitch" } as const;
export const audioPreservePitchProducers = {
  preservePitch: { module: audioPreservePitchModuleRef, name: "preserve-pitch" },
} satisfies Record<string, ProducerRef>;

export const audioPreservePitchManifest: GenerationModuleDefinition = {
  name: audioPreservePitchModuleRef.name,
  dependencies: [audiovisualDependency],
  types: [],
  capabilities: [],
  producers: [{
    name: audioPreservePitchProducers.preservePitch.name,
    inputs: [],
    result: { kind: "output", name: "reconstruction", type: audiovisualTypes.signalReconstruction },
  }],
};
