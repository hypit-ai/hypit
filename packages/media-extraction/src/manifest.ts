import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import { mediaDependency, mediaTypes } from "@hypit/media";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";

export const mediaExtractionModuleRef = { name: "@hypit/media-extraction", version: "1" } as const;
export const mediaExtractionTypes = {
  audioRequest: { module: mediaExtractionModuleRef, name: "AudioExtractionRequest" },
  frameRequest: { module: mediaExtractionModuleRef, name: "FrameExtractionRequest" },
} satisfies Record<string, TypeRef>;
export const mediaExtractionCapabilities = {
  audio: { module: mediaExtractionModuleRef, name: "extract-media-audio" },
  frame: { module: mediaExtractionModuleRef, name: "extract-media-frame" },
} satisfies Record<string, CapabilityRef>;
export const mediaExtractionProducers = {
  audio: { module: mediaExtractionModuleRef, name: "request-audio-extraction" },
  frame: { module: mediaExtractionModuleRef, name: "request-frame-extraction" },
} satisfies Record<string, ProducerRef>;

export const mediaExtractionManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: mediaExtractionModuleRef.name,
  version: mediaExtractionModuleRef.version,
  dependencies: [blobDependency, mediaDependency],
  types: Object.values(mediaExtractionTypes).map((type) => type.name),
  capabilities: [
    { name: mediaExtractionCapabilities.audio.name, returns: blobTypes.blob },
    { name: mediaExtractionCapabilities.frame.name, returns: blobTypes.blob },
  ],
  producers: [{
    name: mediaExtractionProducers.audio.name,
    inputs: [
      { name: "source", type: blobTypes.blob },
      { name: "inspection", type: mediaTypes.inspection },
      { name: "request", type: mediaExtractionTypes.audioRequest },
    ],
    result: { kind: "need", name: "audio", capability: mediaExtractionCapabilities.audio },
  }, {
    name: mediaExtractionProducers.frame.name,
    inputs: [
      { name: "source", type: blobTypes.blob },
      { name: "inspection", type: mediaTypes.inspection },
      { name: "request", type: mediaExtractionTypes.frameRequest },
    ],
    result: { kind: "need", name: "image", capability: mediaExtractionCapabilities.frame },
  }],
};
