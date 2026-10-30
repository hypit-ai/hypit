import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
export const mediaModuleRef = { name: "@hypit/media", version: "1" } as const;
export const mediaTypes = {
  inspection: { module: mediaModuleRef, name: "MediaInspection" },
  streamSelection: { module: mediaModuleRef, name: "MediaStreamSelection" },
  prepared: { module: mediaModuleRef, name: "PreparedMedia" },
  domainSpec: { module: mediaModuleRef, name: "MediaDomainSpec" },
  delivery: { module: mediaModuleRef, name: "MediaDeliverySpec" },
  visualDelivery: { module: mediaModuleRef, name: "VisualDeliverySpec" },
  timelineVisual: { module: mediaModuleRef, name: "TimelineVisual" }, timelineAudio: { module: mediaModuleRef, name: "TimelineAudio" },
  muxed: { module: mediaModuleRef, name: "MuxedMedia" }, fontArtifact: { module: mediaModuleRef, name: "FontArtifactRef" },
  fontStack: { module: mediaModuleRef, name: "FontStackRef" },
  compositableSurface: { module: mediaModuleRef, name: "CompositableSurfaceRef" },
  pictureInterpretation: { module: mediaModuleRef, name: "PictureInterpretation" },
  /** Declared by `@hypit/blob`. A Type is identified by the Module that owns it, not the one that re-exports it. */
  blobArtifact: blobTypes.blob,
} satisfies Record<string, TypeRef>;
export const mediaProducers = {
  prepare: { module: mediaModuleRef, name: "prepare-media" },
  localDomain: { module: mediaModuleRef, name: "local-domain" },
  visualDelivery: { module: mediaModuleRef, name: "project-visual-delivery" },
} satisfies Record<string, ProducerRef>;

export const mediaManifest: ModuleManifest = {
  format: "hypit.module@1", name: mediaModuleRef.name, version: mediaModuleRef.version, dependencies: [blobDependency, temporalDependency],
  types: [
    mediaTypes.inspection.name,
    mediaTypes.streamSelection.name,
    mediaTypes.prepared.name,
    mediaTypes.domainSpec.name,
    mediaTypes.delivery.name,
    mediaTypes.visualDelivery.name,
    mediaTypes.timelineVisual.name,
    mediaTypes.timelineAudio.name,
    mediaTypes.muxed.name,
    mediaTypes.fontArtifact.name, mediaTypes.fontStack.name,
    mediaTypes.compositableSurface.name,
    mediaTypes.pictureInterpretation.name,
  ], capabilities: [], producers: [
    { name: mediaProducers.prepare.name,
      inputs: [
        { name: "source", type: blobTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "selection", type: mediaTypes.streamSelection },
        { name: "spec", type: mediaTypes.domainSpec },
      ],
      result: { kind: "output" as const, name: "media", type: mediaTypes.prepared } },
    { name: mediaProducers.localDomain.name,
      inputs: [{ name: "media", type: mediaTypes.prepared }],
      result: { kind: "output" as const, name: "domain", type: temporalTypes.localDomain } },
    { name: mediaProducers.visualDelivery.name,
      inputs: [{ name: "delivery", type: mediaTypes.delivery }],
      result: { kind: "output" as const, name: "visual", type: mediaTypes.visualDelivery } },
  ],
};
export const mediaDependency = mediaModuleRef;
