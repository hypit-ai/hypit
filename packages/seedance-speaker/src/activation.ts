import { createTextSurfaceHostFacet } from "@svml/text";

import {
  decodeSeedanceSpeakerTakeSurface,
  seedanceSpeakerImplementationDigests,
  seedanceSpeakerManifest,
  seedanceSpeakerModuleRef,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/seedance-speaker",
  modules: [{
    manifest: seedanceSpeakerManifest,
    specifiers: ["@svml/seedance-speaker", "@svml/seedance-speaker@1"],
  }],
  hostFacets: [createTextSurfaceHostFacet({
    module: seedanceSpeakerModuleRef,
    surface: "take",
    mode: "structured",
    implementationDigest: seedanceSpeakerImplementationDigests.takeSurface,
    handler: decodeSeedanceSpeakerTakeSurface,
  })],
};

export default svmlPackage;
