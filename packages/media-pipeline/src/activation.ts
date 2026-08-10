import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  decodeSynchronizedMediaSurface,
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
  })],
};
export default svmlPackage;
