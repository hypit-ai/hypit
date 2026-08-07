import { createTextSurfaceHostFacet } from "@narratage/text";
import {
  decodeSpeechSpineSurface, speechSpineComponent, speechSpineManifest,
  speechSpineModuleRef, speechSpineSurfaceImplementationDigest,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/speech-spine",
  modules: [{
    manifest: speechSpineManifest,
    specifiers: ["@narratage/speech-spine", "@narratage/speech-spine@1"],
  }],
  components: [speechSpineComponent],
  hostFacets: [createTextSurfaceHostFacet({
    module: speechSpineModuleRef, surface: "spine", mode: "structured",
    implementationDigest: speechSpineSurfaceImplementationDigest, handler: decodeSpeechSpineSurface,
  })],
};
export default svmlPackage;
