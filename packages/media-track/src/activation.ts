import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  decodeMediaTrackSurface,
  mediaTrackComponent,
  mediaTrackManifest,
  mediaTrackModuleRef,
  mediaTrackSurfaceImplementationDigest,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/media-track",
  modules: [{ manifest: mediaTrackManifest, specifiers: [mediaTrackModuleRef.name, `${mediaTrackModuleRef.name}@1`] }],
  components: [mediaTrackComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: mediaTrackModuleRef,
    surface: "track",
    mode: "structured",
    implementationDigest: mediaTrackSurfaceImplementationDigest,
    handler: decodeMediaTrackSurface,
  })],
};
export default svmlPackage;
