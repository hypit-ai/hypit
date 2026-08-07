import { createTextSurfaceHostFacet } from "@narratage/text";

import {
  decodeSeedanceSpeakerTakeSurface,
  seedanceSpeakerImplementationDigests,
  seedanceSpeakerManifest,
  seedanceSpeakerModuleRef,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/seedance-speaker",
  modules: [{
    manifest: seedanceSpeakerManifest,
    specifiers: ["@narratage/seedance-speaker", "@narratage/seedance-speaker@1"],
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
