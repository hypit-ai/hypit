import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  decodeSynchronizedMediaSurface,
  decodeExtractAudioSurface,
  decodeExtractFrameSurface,
  decodeTransformMediaSurface,
  mediaOperationSurfaceImplementationDigests,
  mediaPipelineComponent,
  mediaPipelineManifest,
  mediaPipelineModuleRef,
  synchronizedMediaSurfaceImplementationDigest,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/media-pipeline",
  modules: [{ manifest: mediaPipelineManifest, specifiers: [mediaPipelineModuleRef.name, `${mediaPipelineModuleRef.name}@1`] }],
  components: [mediaPipelineComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: mediaPipelineModuleRef,
    surface: "synchronized-media",
    mode: "structured",
    implementationDigest: synchronizedMediaSurfaceImplementationDigest,
    handler: decodeSynchronizedMediaSurface,
  }), createMarkupSurfaceHostFacet({
    module: mediaPipelineModuleRef,
    surface: "transform-media",
    mode: "structured",
    implementationDigest: mediaOperationSurfaceImplementationDigests.transform,
    handler: decodeTransformMediaSurface,
  }), createMarkupSurfaceHostFacet({
    module: mediaPipelineModuleRef,
    surface: "extract-audio",
    mode: "structured",
    implementationDigest: mediaOperationSurfaceImplementationDigests.extractAudio,
    handler: decodeExtractAudioSurface,
  }), createMarkupSurfaceHostFacet({
    module: mediaPipelineModuleRef,
    surface: "extract-frame",
    mode: "structured",
    implementationDigest: mediaOperationSurfaceImplementationDigests.extractFrame,
    handler: decodeExtractFrameSurface,
  })],
};
export default svmlPackage;
