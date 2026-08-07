import { createTextSurfaceHostFacet } from "@svml/text";
import {
  captionComponent, captionManifest, captionModuleRef,
  captionProgramSurfaceImplementationDigest, captionStyleSurfaceImplementationDigest,
  captionSurfaceImplementationDigest, decodeCaptionProgramSurface, decodeCaptionStyleSurface,
  decodeCaptionTrackSurface,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/caption",
  modules: [{ manifest: captionManifest, specifiers: ["@svml/caption", "@svml/caption@1"] }],
  components: [captionComponent],
  hostFacets: [
    createTextSurfaceHostFacet({ module: captionModuleRef, surface: "style", mode: "structured", implementationDigest: captionStyleSurfaceImplementationDigest, handler: decodeCaptionStyleSurface }),
    createTextSurfaceHostFacet({ module: captionModuleRef, surface: "program", mode: "structured", implementationDigest: captionProgramSurfaceImplementationDigest, handler: decodeCaptionProgramSurface }),
    createTextSurfaceHostFacet({ module: captionModuleRef, surface: "track", mode: "structured", implementationDigest: captionSurfaceImplementationDigest, handler: decodeCaptionTrackSurface }),
  ],
};
export default svmlPackage;
