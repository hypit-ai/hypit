import { createTextSurfaceHostFacet } from "@narratage/text";
import {
  decodeScreenOverlaySurface, screenOverlayComponent, screenOverlayManifest, screenOverlayModuleRef,
  screenOverlaySurfaceImplementationDigest,
} from "./index.js";
export const svmlPackage = {
  format: "svml.node-package@1" as const, name: "@narratage/screen-overlay",
  modules: [{ manifest: screenOverlayManifest, specifiers: [screenOverlayModuleRef.name, `${screenOverlayModuleRef.name}@1`] }],
  components: [screenOverlayComponent],
  hostFacets: [createTextSurfaceHostFacet({
    module: screenOverlayModuleRef, surface: "track", mode: "structured",
    implementationDigest: screenOverlaySurfaceImplementationDigest, handler: decodeScreenOverlaySurface,
  })],
};
export default svmlPackage;
