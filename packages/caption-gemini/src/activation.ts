import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  captionGeminiComponent, captionGeminiImplementationDigests, captionGeminiManifest,
  captionGeminiModuleRef, decodeCaptionGeminiPlannerSurface,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/caption-gemini",
  modules: [{ manifest: captionGeminiManifest, specifiers: ["@narratage/caption-gemini", "@narratage/caption-gemini@1"] }],
  components: [captionGeminiComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: captionGeminiModuleRef, surface: "planner", mode: "structured",
    implementationDigest: captionGeminiImplementationDigests.plannerSurface,
    handler: decodeCaptionGeminiPlannerSurface,
  })],
};
export default svmlPackage;
