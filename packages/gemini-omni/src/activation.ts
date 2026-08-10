import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  geminiOmniComponent,
  geminiOmniManifest,
  geminiOmniModuleRef,
  geminiOmniSurfaceImplementationDigest,
} from "./index.js";
import { decodeGeminiOmniVideoSurface } from "./surface.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/gemini-omni",
  modules: [{ manifest: geminiOmniManifest, specifiers: ["@narratage/gemini-omni", "@narratage/gemini-omni@1"] }],
  components: [geminiOmniComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: geminiOmniModuleRef,
    surface: "video",
    mode: "structured",
    implementationDigest: geminiOmniSurfaceImplementationDigest,
    handler: decodeGeminiOmniVideoSurface,
  })],
};
export default svmlPackage;
