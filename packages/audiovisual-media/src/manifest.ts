import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import { mediaDependency, mediaTypes } from "@hypit/media";
import type { ModuleManifest, ProducerRef } from "@hypit/protocol";

export const audiovisualMediaModuleRef = {
  name: "@hypit/audiovisual-media",
  version: "1",
} as const;

export const audiovisualMediaProducers = {
  source: { module: audiovisualMediaModuleRef, name: "prepared-media-source" },
} satisfies Record<string, ProducerRef>;

export const audiovisualMediaManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: audiovisualMediaModuleRef.name,
  version: audiovisualMediaModuleRef.version,
  dependencies: [audiovisualDependency, mediaDependency],
  types: [],
  capabilities: [],
  producers: [{
    name: audiovisualMediaProducers.source.name,
    inputs: [{ name: "media", type: mediaTypes.prepared }],
    result: { kind: "output", name: "source", type: audiovisualTypes.programSource },
  }],
};

export const audiovisualMediaDependency = audiovisualMediaModuleRef;
