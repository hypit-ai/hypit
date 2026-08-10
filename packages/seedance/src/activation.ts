import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeSeedanceSpeechSurface,
  decodeSeedanceVideoSurface,
  seedanceComponent,
  seedanceManifest,
  seedanceModuleRef,
  seedanceSurfaceImplementationDigests,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/seedance",
  modules: [{ manifest: seedanceManifest, specifiers: ["@narratage/seedance", "@narratage/seedance@1"] }],
  components: [seedanceComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: seedanceModuleRef,
      surface: "speech",
      mode: "structured",
      implementationDigest: seedanceSurfaceImplementationDigests.speech,
      handler: decodeSeedanceSpeechSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: seedanceModuleRef,
      surface: "video",
      mode: "structured",
      implementationDigest: seedanceSurfaceImplementationDigests.video,
      handler: decodeSeedanceVideoSurface,
    }),
  ],
};

export default svmlPackage;
