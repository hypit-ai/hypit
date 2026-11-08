import { blobDependency, blobTypes } from "@hypit/blob";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { temporalDependency, temporalTypes } from "@hypit/temporal-graph";
export const mediaModuleRef = { name: "@hypit/media", version: "1" } as const;
export const mediaTypes = {
  inspection: { module: mediaModuleRef, name: "MediaInspection" },
  selectionRequest: { module: mediaModuleRef, name: "MediaSelectionRequest" },
  audioExtractionRequest: { module: mediaModuleRef, name: "AudioExtractionRequest" },
  frameExtractionRequest: { module: mediaModuleRef, name: "FrameExtractionRequest" },
  streamSelection: { module: mediaModuleRef, name: "MediaStreamSelection" },
  prepared: { module: mediaModuleRef, name: "PreparedMedia" },
  domainSpec: { module: mediaModuleRef, name: "MediaDomainSpec" },
  delivery: { module: mediaModuleRef, name: "MediaDeliverySpec" },
  visualDelivery: { module: mediaModuleRef, name: "VisualDeliverySpec" },
  renderedVisual: { module: mediaModuleRef, name: "RenderedVisual" },
  renderedAudio: { module: mediaModuleRef, name: "RenderedAudio" },
  muxed: { module: mediaModuleRef, name: "MuxedMedia" },
  fontArtifact: { module: mediaModuleRef, name: "FontArtifactRef" },
  fontStack: { module: mediaModuleRef, name: "FontStackRef" },
  pictureInterpretation: { module: mediaModuleRef, name: "PictureInterpretation" },
  /** Declared by `@hypit/blob`. A Type is identified by the Module that owns it, not the one that re-exports it. */
  blobArtifact: blobTypes.blob,
} satisfies Record<string, TypeRef>;
export const mediaCapabilities = {
  inspect: { module: mediaModuleRef, name: "inspect-media" },
  extractAudio: { module: mediaModuleRef, name: "extract-audio" },
  extractFrame: { module: mediaModuleRef, name: "extract-frame" },
} satisfies Record<string, CapabilityRef>;
export const mediaProducers = {
  resource: { module: mediaModuleRef, name: "media-resource" },
  inspect: { module: mediaModuleRef, name: "request-media-inspection" },
  extractAudio: { module: mediaModuleRef, name: "request-audio-extraction" },
  extractFrame: { module: mediaModuleRef, name: "request-frame-extraction" },
  select: { module: mediaModuleRef, name: "select-media-streams" },
  prepare: { module: mediaModuleRef, name: "prepare-media" },
  localDomain: { module: mediaModuleRef, name: "local-domain" },
  extent: { module: mediaModuleRef, name: "extent" },
  visualDelivery: { module: mediaModuleRef, name: "project-visual-delivery" },
} satisfies Record<string, ProducerRef>;

export const mediaManifest: ModuleManifest = {
  format: "hypit.module@1", name: mediaModuleRef.name, version: mediaModuleRef.version, dependencies: [blobDependency, temporalDependency],
  types: [
    mediaTypes.inspection.name,
    mediaTypes.selectionRequest.name,
    mediaTypes.audioExtractionRequest.name,
    mediaTypes.frameExtractionRequest.name,
    mediaTypes.streamSelection.name,
    mediaTypes.prepared.name,
    mediaTypes.domainSpec.name,
    mediaTypes.delivery.name,
    mediaTypes.visualDelivery.name,
    mediaTypes.renderedVisual.name,
    mediaTypes.renderedAudio.name,
    mediaTypes.muxed.name,
    mediaTypes.fontArtifact.name, mediaTypes.fontStack.name,
    mediaTypes.pictureInterpretation.name,
  ], capabilities: [
    { name: mediaCapabilities.inspect.name, returns: mediaTypes.inspection },
    { name: mediaCapabilities.extractAudio.name, returns: blobTypes.blob },
    { name: mediaCapabilities.extractFrame.name, returns: blobTypes.blob },
  ], producers: [
    { name: mediaProducers.resource.name,
      inputs: [{ name: "resource", type: blobTypes.blob }],
      result: { kind: "output" as const, name: "resource", type: blobTypes.blob } },
    { name: mediaProducers.inspect.name,
      inputs: [{ name: "source", type: blobTypes.blob }],
      result: { kind: "need" as const, name: "inspection", capability: mediaCapabilities.inspect } },
    { name: mediaProducers.extractAudio.name,
      inputs: [
        { name: "source", type: blobTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaTypes.audioExtractionRequest },
      ],
      result: { kind: "need" as const, name: "audio", capability: mediaCapabilities.extractAudio } },
    { name: mediaProducers.extractFrame.name,
      inputs: [
        { name: "source", type: blobTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaTypes.frameExtractionRequest },
      ],
      result: { kind: "need" as const, name: "image", capability: mediaCapabilities.extractFrame } },
    { name: mediaProducers.select.name,
      inputs: [
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaTypes.selectionRequest },
      ],
      result: { kind: "output" as const, name: "selection", type: mediaTypes.streamSelection } },
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
    { name: mediaProducers.extent.name,
      inputs: [{ name: "domain", type: temporalTypes.localDomain }],
      result: { kind: "output" as const, name: "extent", type: temporalTypes.extent } },
    { name: mediaProducers.visualDelivery.name,
      inputs: [{ name: "delivery", type: mediaTypes.delivery }],
      result: { kind: "output" as const, name: "visual", type: mediaTypes.visualDelivery } },
  ],
};
export const mediaDependency = mediaModuleRef;
