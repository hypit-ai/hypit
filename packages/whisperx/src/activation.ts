import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  decodeWhisperXAlignmentSurface, whisperXComponent, whisperXImplementationDigests,
  whisperXManifest, whisperXModuleRef,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/whisperx",
  modules: [{ manifest: whisperXManifest, specifiers: ["@narratage/whisperx", "@narratage/whisperx@1"] }],
  components: [whisperXComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: whisperXModuleRef, surface: "alignment", mode: "structured",
    implementationDigest: whisperXImplementationDigests.surface,
    handler: decodeWhisperXAlignmentSurface,
  })],
};
export default svmlPackage;
