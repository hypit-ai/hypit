import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import { mediaDependency, mediaTypes } from "@hypit/media";
import type { CapabilityRef, ModuleManifest, ProducerRef } from "@hypit/hypit/protocol";

export const mediaDeliveryModuleRef = { name: "@hypit/media-delivery", version: "1" } as const;
export const mediaDeliveryCapabilities = {
  mux: { module: mediaDeliveryModuleRef, name: "mux-program-media" },
} satisfies Record<string, CapabilityRef>;
export const mediaDeliveryProducers = {
  mux: { module: mediaDeliveryModuleRef, name: "request-media-mux" },
  projectVideo: { module: mediaDeliveryModuleRef, name: "project-muxed-video" },
} satisfies Record<string, ProducerRef>;

export const mediaDeliveryManifest: ModuleManifest = {
  format: "hypit.module@1",
  ...mediaDeliveryModuleRef,
  dependencies: [blobDependency, mediaDependency],
  types: [],
  capabilities: [{ name: mediaDeliveryCapabilities.mux.name, returns: mediaTypes.muxed }],
  producers: [
    {
      name: mediaDeliveryProducers.mux.name,
      inputs: [
        { name: "visual", type: mediaTypes.timelineVisual },
        { name: "audio", type: mediaTypes.timelineAudio },
        { name: "delivery", type: mediaTypes.delivery },
      ],
      result: { kind: "need", name: "media", capability: mediaDeliveryCapabilities.mux },
    },
    {
      name: mediaDeliveryProducers.projectVideo.name,
      inputs: [{ name: "media", type: mediaTypes.muxed }],
      result: { kind: "output", name: "video", type: blobTypes.blob },
    },
  ],
};

export const mediaDeliveryDependency = mediaDeliveryModuleRef;
