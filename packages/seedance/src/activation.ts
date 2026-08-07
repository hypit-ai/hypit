import { createTextSurfaceHostFacet } from "@svml/text";

import {
  decodeSeedancePromptSurface,
  decodeSeedanceSpeechSurface,
  decodeSeedanceVideoSurface,
  seedanceComponent,
  seedanceManifest,
  seedanceModuleRef,
  seedanceSurfaceImplementationDigests,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/seedance",
  modules: [{ manifest: seedanceManifest, specifiers: ["@svml/seedance", "@svml/seedance@1"] }],
  components: [seedanceComponent],
  hostFacets: [
    createTextSurfaceHostFacet({
      module: seedanceModuleRef,
      surface: "prompt",
      mode: "structured",
      implementationDigest: seedanceSurfaceImplementationDigests.prompt,
      handler: decodeSeedancePromptSurface,
    }),
    createTextSurfaceHostFacet({
      module: seedanceModuleRef,
      surface: "speech",
      mode: "structured",
      implementationDigest: seedanceSurfaceImplementationDigests.speech,
      handler: decodeSeedanceSpeechSurface,
    }),
    createTextSurfaceHostFacet({
      module: seedanceModuleRef,
      surface: "video",
      mode: "structured",
      implementationDigest: seedanceSurfaceImplementationDigests.video,
      handler: decodeSeedanceVideoSurface,
    }),
  ],
};

export default svmlPackage;
