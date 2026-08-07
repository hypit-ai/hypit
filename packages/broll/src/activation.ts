import { createTextSurfaceHostFacet } from "@svml/text";
import {
  brollComponent, brollManifest, brollModuleRef, brollSurfaceImplementationDigest,
  decodeBrollTrackSurface,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/broll",
  modules: [{ manifest: brollManifest, specifiers: ["@svml/broll", "@svml/broll@1"] }],
  components: [brollComponent],
  hostFacets: [createTextSurfaceHostFacet({
    module: brollModuleRef, surface: "track", mode: "structured",
    implementationDigest: brollSurfaceImplementationDigest, handler: decodeBrollTrackSurface,
  })],
};
export default svmlPackage;
