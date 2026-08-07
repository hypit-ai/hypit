import { createTextSurfaceHostFacet } from "@narratage/text";
import {
  decodeTextTrackSurface, textTrackComponent, textTrackManifest, textTrackModuleRef,
  textTrackSurfaceImplementationDigest,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/text-track",
  modules: [{ manifest: textTrackManifest, specifiers: ["@narratage/text-track", "@narratage/text-track@1"] }],
  components: [textTrackComponent],
  hostFacets: [createTextSurfaceHostFacet({
    module: textTrackModuleRef, surface: "track", mode: "structured",
    implementationDigest: textTrackSurfaceImplementationDigest, handler: decodeTextTrackSurface,
  })],
};
export default svmlPackage;
