import { createTextSurfaceHostFacet } from "@narratage/text";
import {
  decodeTextMotionSurface,
  decodeTextMaskSurface,
  decodeTextStyleSurface,
  decodeTextTrackSurface,
  textTrackComponent,
  textTrackManifest,
  textTrackModuleRef,
  textTrackSurfaceImplementationDigests,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/text-track",
  modules: [{ manifest: textTrackManifest, specifiers: ["@narratage/text-track", "@narratage/text-track@1"] }],
  components: [textTrackComponent],
  hostFacets: [
    createTextSurfaceHostFacet({
      module: textTrackModuleRef, surface: "style", mode: "structured",
      implementationDigest: textTrackSurfaceImplementationDigests.style, handler: decodeTextStyleSurface,
    }),
    createTextSurfaceHostFacet({
      module: textTrackModuleRef, surface: "motion", mode: "structured",
      implementationDigest: textTrackSurfaceImplementationDigests.motion, handler: decodeTextMotionSurface,
    }),
    createTextSurfaceHostFacet({
      module: textTrackModuleRef, surface: "track", mode: "structured",
      implementationDigest: textTrackSurfaceImplementationDigests.track, handler: decodeTextTrackSurface,
    }),
    createTextSurfaceHostFacet({
      module: textTrackModuleRef, surface: "mask", mode: "structured",
      implementationDigest: textTrackSurfaceImplementationDigests.mask, handler: decodeTextMaskSurface,
    }),
  ],
};
export default svmlPackage;
