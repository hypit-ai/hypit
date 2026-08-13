import { artifactDependency, artifactTypes } from "@narratage/artifact";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, TypeRef } from "@narratage/protocol";
import { compositableSurfaceSchema, fontArtifactSchema, fontStackSchema, mediaInspectionSchema, mediaStreamSelectionSchema, muxedMediaSchema, renderedVisualSchema, synchronizedMediaSchema, timelineAudioSchema } from "./schema.js";
export const mediaModuleRef = { name: "@narratage/media", version: "1" } as const;
export const mediaTypes = {
  inspection: { module: mediaModuleRef, name: "MediaInspection" },
  streamSelection: { module: mediaModuleRef, name: "MediaStreamSelection" }, synchronized: { module: mediaModuleRef, name: "SynchronizedMedia" },
  renderedVisual: { module: mediaModuleRef, name: "RenderedVisual" }, timelineAudio: { module: mediaModuleRef, name: "TimelineAudio" },
  muxed: { module: mediaModuleRef, name: "MuxedMedia" }, fontArtifact: { module: mediaModuleRef, name: "FontArtifactRef" },
  fontStack: { module: mediaModuleRef, name: "FontStackRef" },
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
const validator = (digest: ReturnType<typeof digestOf>) => ({ implementation: { digest } });

export const mediaMarkupSurfaces = [
    { name: "image", tag: "Image", mode: "structured", outputs: [artifactTypes.blob], implementation: { digest: mediaSurfaceImplementationDigests.image } },
    { name: "audio", tag: "Audio", mode: "structured", outputs: [artifactTypes.blob], implementation: { digest: mediaSurfaceImplementationDigests.audio } },
    { name: "font", tag: "Font", mode: "structured", outputs: [mediaTypes.fontArtifact], implementation: { digest: mediaSurfaceImplementationDigests.font } },
  ] as const;

export const mediaManifest: ModuleManifest = {
  format: "svml.module@1", name: mediaModuleRef.name, version: mediaModuleRef.version, dependencies: [artifactDependency],
  types: [
    { name: mediaTypes.inspection.name, schema: mediaInspectionSchema, validator: validator(mediaValidatorDigests.inspection) },
    { name: mediaTypes.streamSelection.name, schema: mediaStreamSelectionSchema, validator: validator(mediaValidatorDigests.selection) },
    { name: mediaTypes.synchronized.name, schema: synchronizedMediaSchema, validator: validator(mediaValidatorDigests.synchronized) },
    { name: mediaTypes.renderedVisual.name, schema: renderedVisualSchema, validator: validator(mediaValidatorDigests.renderedVisual) },
    { name: mediaTypes.timelineAudio.name, schema: timelineAudioSchema, validator: validator(mediaValidatorDigests.timelineAudio) },
    { name: mediaTypes.muxed.name, schema: muxedMediaSchema, validator: validator(mediaValidatorDigests.muxed) },
    { name: mediaTypes.fontArtifact.name, schema: fontArtifactSchema }, { name: mediaTypes.fontStack.name, schema: fontStackSchema },
    { name: mediaTypes.compositableSurface.name, schema: compositableSurfaceSchema },
  ], capabilities: [], producers: [],
};
export const mediaManifestDigest = digestOf(mediaManifest);
export const mediaDependency = { module: mediaModuleRef, digest: mediaManifestDigest } as const;
