import { createTextSurfaceHostFacet } from "@svml/text";
import {
  captionGeminiComponent, captionGeminiImplementationDigests, captionGeminiManifest,
  captionGeminiModuleRef, decodeCaptionGeminiPlannerSurface,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/caption-gemini",
  modules: [{ manifest: captionGeminiManifest, specifiers: ["@svml/caption-gemini", "@svml/caption-gemini@1"] }],
  components: [captionGeminiComponent],
  hostFacets: [createTextSurfaceHostFacet({
    module: captionGeminiModuleRef, surface: "planner", mode: "structured",
    implementationDigest: captionGeminiImplementationDigests.plannerSurface,
    handler: decodeCaptionGeminiPlannerSurface,
  })],
};
export default svmlPackage;
