import { createTextSurfaceHostFacet } from "@svml/text";
import {
  decodeWhisperXAlignmentSurface, whisperXComponent, whisperXImplementationDigests,
  whisperXManifest, whisperXModuleRef,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/whisperx",
  modules: [{ manifest: whisperXManifest, specifiers: ["@svml/whisperx", "@svml/whisperx@1"] }],
  components: [whisperXComponent],
  hostFacets: [createTextSurfaceHostFacet({
    module: whisperXModuleRef, surface: "alignment", mode: "structured",
    implementationDigest: whisperXImplementationDigests.surface,
    handler: decodeWhisperXAlignmentSurface,
  })],
};
export default svmlPackage;
