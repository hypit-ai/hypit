import { artifactDependency, artifactTypes } from "@narratage/artifact";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, TypeRef } from "@narratage/protocol";
import { compositableSurfaceSchema, fontArtifactSchema, mediaArtifactSchema, mediaInspectionSchema, mediaStreamSelectionSchema, muxedMediaSchema, renderedVisualSchema, synchronizedMediaSchema, timelineAudioSchema } from "./schema.js";
export const mediaModuleRef = { name: "@narratage/media", version: "0.0.0-dev" } as const;
export const mediaTypes = {
  artifact: { module: mediaModuleRef, name: "MediaArtifactRef" }, inspection: { module: mediaModuleRef, name: "MediaInspection" },
  streamSelection: { module: mediaModuleRef, name: "MediaStreamSelection" }, synchronized: { module: mediaModuleRef, name: "SynchronizedMedia" },
  renderedVisual: { module: mediaModuleRef, name: "RenderedVisual" }, timelineAudio: { module: mediaModuleRef, name: "TimelineAudio" },
  muxed: { module: mediaModuleRef, name: "MuxedMedia" }, fontArtifact: { module: mediaModuleRef, name: "FontArtifactRef" },
  compositableSurface: { module: mediaModuleRef, name: "CompositableSurfaceRef" }, blobArtifact: artifactTypes.blob,
} satisfies Record<string, TypeRef>;
export const mediaValidatorDigests = {
  inspection: digestOf("@narratage/media/validate-media-inspection@1"), selection: digestOf("@narratage/media/validate-media-stream-selection@1"),
  synchronized: digestOf("@narratage/media/validate-synchronized-media@1"), renderedVisual: digestOf("@narratage/media/validate-rendered-visual@1"),
  timelineAudio: digestOf("@narratage/media/validate-timeline-audio@1"), muxed: digestOf("@narratage/media/validate-muxed-media@1"),
} as const;
export const mediaSurfaceImplementationDigests = {
  image: digestOf("@narratage/media/image-surface@1"),
  audio: digestOf("@narratage/media/audio-surface@1"),
  font: digestOf("@narratage/media/font-surface@1"),
} as const;
const validator = (locator: string, digest: ReturnType<typeof digestOf>) => ({ abi: "svml.type-validator@1" as const, implementation: { kind: "registered" as const, locator, digest } });
export const mediaManifest: ModuleManifest = {
  format: "svml.module@1", name: mediaModuleRef.name, version: mediaModuleRef.version, dependencies: [artifactDependency],
  types: [
    { name: mediaTypes.artifact.name, schema: mediaArtifactSchema },
    { name: mediaTypes.inspection.name, schema: mediaInspectionSchema, validator: validator("@narratage/media/validate-media-inspection", mediaValidatorDigests.inspection) },
    { name: mediaTypes.streamSelection.name, schema: mediaStreamSelectionSchema, validator: validator("@narratage/media/validate-media-stream-selection", mediaValidatorDigests.selection) },
    { name: mediaTypes.synchronized.name, schema: synchronizedMediaSchema, validator: validator("@narratage/media/validate-synchronized-media", mediaValidatorDigests.synchronized) },
    { name: mediaTypes.renderedVisual.name, schema: renderedVisualSchema, validator: validator("@narratage/media/validate-rendered-visual", mediaValidatorDigests.renderedVisual) },
    { name: mediaTypes.timelineAudio.name, schema: timelineAudioSchema, validator: validator("@narratage/media/validate-timeline-audio", mediaValidatorDigests.timelineAudio) },
    { name: mediaTypes.muxed.name, schema: muxedMediaSchema, validator: validator("@narratage/media/validate-muxed-media", mediaValidatorDigests.muxed) },
    { name: mediaTypes.fontArtifact.name, schema: fontArtifactSchema }, { name: mediaTypes.compositableSurface.name, schema: compositableSurfaceSchema },
  ], capabilities: [],
  surfaces: [
    { name: "image", tag: "Image", mode: "structured", outputs: [artifactTypes.blob], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/media/image-surface", digest: mediaSurfaceImplementationDigests.image } },
    { name: "audio", tag: "Audio", mode: "structured", outputs: [artifactTypes.blob], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/media/audio-surface", digest: mediaSurfaceImplementationDigests.audio } },
    { name: "font", tag: "Font", mode: "structured", outputs: [mediaTypes.fontArtifact], implementation: { kind: "trusted-frontend-surface", locator: "@narratage/media/font-surface", digest: mediaSurfaceImplementationDigests.font } },
  ], producers: [],
};
export const mediaManifestDigest = digestOf(mediaManifest);
export const mediaDependency = { module: mediaModuleRef, digest: mediaManifestDigest } as const;
