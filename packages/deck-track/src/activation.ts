import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeDepthStackLabelSurface,
  decodeDepthStackSurface,
  depthStackComponent,
  depthStackManifest,
  depthStackModuleRef,
  depthStackSurfaceImplementationDigests,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/deck-track",
  modules: [{
    manifest: depthStackManifest,
    specifiers: [depthStackModuleRef.name, `${depthStackModuleRef.name}@1`],
  }],
  components: [depthStackComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: depthStackModuleRef,
      surface: "label",
      mode: "structured",
      implementationDigest: depthStackSurfaceImplementationDigests.label,
      handler: decodeDepthStackLabelSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: depthStackModuleRef,
      surface: "track",
      mode: "structured",
      implementationDigest: depthStackSurfaceImplementationDigests.track,
      handler: decodeDepthStackSurface,
    }),
  ],
};

export default svmlPackage;
