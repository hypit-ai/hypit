import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  decodeTypographyMotionSurface,
  decodeTypographyMaskSurface,
  decodeTypographyStyleSurface,
  decodeTypographyTrackSurface,
  typographyTrackComponent,
  typographyTrackManifest,
  typographyTrackModuleRef,
  typographyTrackSurfaceImplementationDigests,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/typography-track",
  modules: [{ manifest: typographyTrackManifest, specifiers: ["@narratage/typography-track", "@narratage/typography-track@1"] }],
  components: [typographyTrackComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: typographyTrackModuleRef, surface: "style", mode: "structured",
      implementationDigest: typographyTrackSurfaceImplementationDigests.style, handler: decodeTypographyStyleSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: typographyTrackModuleRef, surface: "motion", mode: "structured",
      implementationDigest: typographyTrackSurfaceImplementationDigests.motion, handler: decodeTypographyMotionSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: typographyTrackModuleRef, surface: "track", mode: "structured",
      implementationDigest: typographyTrackSurfaceImplementationDigests.track, handler: decodeTypographyTrackSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: typographyTrackModuleRef, surface: "mask", mode: "structured",
      implementationDigest: typographyTrackSurfaceImplementationDigests.mask, handler: decodeTypographyMaskSurface,
    }),
  ],
};
export default svmlPackage;
