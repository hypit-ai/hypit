import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeSeedanceFrameVideoSurface,
  decodeSeedanceReferenceVideoSurface,
  decodeSeedanceTextVideoSurface,
  seedanceComponent,
  seedanceManifest,
  seedanceModuleRef,
  seedanceSurfaceImplementationDigests,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/seedance",
  modules: [{ manifest: seedanceManifest, specifiers: ["@narratage/seedance", "@narratage/seedance@1"] }],
  components: [seedanceComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: seedanceModuleRef,
      surface: "text-video",
      mode: "structured",
      implementationDigest: seedanceSurfaceImplementationDigests.textVideo,
      handler: decodeSeedanceTextVideoSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: seedanceModuleRef,
      surface: "frame-video",
      mode: "structured",
      implementationDigest: seedanceSurfaceImplementationDigests.frameVideo,
      handler: decodeSeedanceFrameVideoSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: seedanceModuleRef,
      surface: "reference-video",
      mode: "structured",
      implementationDigest: seedanceSurfaceImplementationDigests.referenceVideo,
      handler: decodeSeedanceReferenceVideoSurface,
    }),
  ],
};

export default svmlPackage;
