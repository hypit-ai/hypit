import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import {
  geminiOmniComponent,
  geminiOmniDefinition,
  geminiOmniManifest,
  geminiOmniModuleRef,
  geminiOmniMarkupSurfaces,
} from "./index.js";
import { decodeGeminiOmniVideoSurface } from "./surface.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: geminiOmniManifest }],
  components: [geminiOmniComponent],
  hostFacets: [geminiOmniDefinition.hostFacet, createMarkupSurfaceHostFacet({
    module: geminiOmniModuleRef,
    declaration: geminiOmniMarkupSurfaces.find((item) => item.name === "video")!,
    handler: decodeGeminiOmniVideoSurface,
  })],
};
export default hypitPackage;
