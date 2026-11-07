import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { ModuleManifest, ProducerRef } from "@hypit/protocol";

export const audioPreservePitchModuleRef = { name: "@hypit/audio-preserve-pitch", version: "1" } as const;
export const audioPreservePitchProducers = {
  preservePitch: { module: audioPreservePitchModuleRef, name: "preserve-pitch" },
} satisfies Record<string, ProducerRef>;

export const audioPreservePitchManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: audioPreservePitchModuleRef.name,
  version: audioPreservePitchModuleRef.version,
  dependencies: [audiovisualDependency],
  types: [],
  capabilities: [],
  producers: [{
    name: audioPreservePitchProducers.preservePitch.name,
    inputs: [],
    result: { kind: "output", name: "reconstruction", type: audiovisualTypes.signalReconstruction },
  }],
};
