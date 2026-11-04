import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { ModuleManifest, ProducerRef } from "@hypit/hypit/protocol";

export const audioStretchModuleRef = { name: "@hypit/audio-stretch", version: "1" } as const;
export const audioStretchProducers = {
  preservePitch: { module: audioStretchModuleRef, name: "preserve-pitch" },
} satisfies Record<string, ProducerRef>;

export const audioStretchManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: audioStretchModuleRef.name,
  version: audioStretchModuleRef.version,
  dependencies: [audiovisualDependency],
  types: [],
  capabilities: [],
  producers: [{
    name: audioStretchProducers.preservePitch.name,
    inputs: [],
    result: { kind: "output", name: "reconstruction", type: audiovisualTypes.signalReconstruction },
  }],
};
