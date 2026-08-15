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
const validator = (digest: ReturnType<typeof digestOf>) => ({ implementation: { digest } });

export const mediaMarkupSurfaces = [
    { name: "image", tag: "Image", mode: "structured", outputs: [artifactTypes.blob] },
    { name: "audio", tag: "Audio", mode: "structured", outputs: [artifactTypes.blob] },
    { name: "font", tag: "Font", mode: "structured", outputs: [mediaTypes.fontArtifact] },
  ] as const;

export const mediaManifest: ModuleManifest = {
  format: "narratage.module@1", name: mediaModuleRef.name, version: mediaModuleRef.version, dependencies: [artifactDependency],
  types: [
    { name: mediaTypes.inspection.name },
    { name: mediaTypes.streamSelection.name },
    { name: mediaTypes.synchronized.name },
    { name: mediaTypes.renderedVisual.name },
    { name: mediaTypes.timelineAudio.name },
    { name: mediaTypes.muxed.name },
    { name: mediaTypes.fontArtifact.name }, { name: mediaTypes.fontStack.name },
    { name: mediaTypes.compositableSurface.name },
  ], capabilities: [], producers: [],
};
export const mediaDependency = { module: mediaModuleRef } as const;
