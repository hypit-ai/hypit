import { createTextSurfaceHostFacet } from "@narratage/text";
import {
  decodeSpeechSpineSurface, speechProgramComponent, speechProgramManifest,
  speechProgramModuleRef, speechSpineSurfaceImplementationDigest,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/speech-program",
  modules: [{ manifest: speechProgramManifest, specifiers: ["@narratage/speech", "@narratage/speech@1"] }],
  components: [speechProgramComponent],
  hostFacets: [createTextSurfaceHostFacet({
    module: speechProgramModuleRef, surface: "spine", mode: "structured",
    implementationDigest: speechSpineSurfaceImplementationDigest, handler: decodeSpeechSpineSurface,
  })],
};
export default svmlPackage;
