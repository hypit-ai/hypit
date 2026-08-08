import { createTextSurfaceHostFacet } from "@narratage/text";
import {
  captionComponent, captionManifest, captionModuleRef,
  captionProgramSurfaceImplementationDigest, decodeCaptionProgramSurface,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/caption",
  modules: [{ manifest: captionManifest, specifiers: ["@narratage/caption", "@narratage/caption@1"] }],
  components: [captionComponent],
  hostFacets: [
    createTextSurfaceHostFacet({ module: captionModuleRef, surface: "program", mode: "structured", implementationDigest: captionProgramSurfaceImplementationDigest, handler: decodeCaptionProgramSurface }),
  ],
};
export default svmlPackage;
