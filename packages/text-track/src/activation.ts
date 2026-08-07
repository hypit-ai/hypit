import { createTextSurfaceHostFacet } from "@svml/text";
import {
  decodeTextTrackSurface, textTrackComponent, textTrackManifest, textTrackModuleRef,
  textTrackSurfaceImplementationDigest,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/text-track",
  modules: [{ manifest: textTrackManifest, specifiers: ["@svml/text-track", "@svml/text-track@1"] }],
  components: [textTrackComponent],
  hostFacets: [createTextSurfaceHostFacet({
    module: textTrackModuleRef, surface: "track", mode: "structured",
    implementationDigest: textTrackSurfaceImplementationDigest, handler: decodeTextTrackSurface,
  })],
};
export default svmlPackage;
