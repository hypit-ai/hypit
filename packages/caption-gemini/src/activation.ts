import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  captionGeminiComponent, captionGeminiManifest,
  captionGeminiModuleRef, decodeCaptionGeminiPlannerSurface,
  captionGeminiMarkupSurfaces,
} from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: captionGeminiManifest }],
  components: [captionGeminiComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: captionGeminiModuleRef,
    declaration: captionGeminiMarkupSurfaces.find((item) => item.name === "planner")!,
    handler: decodeCaptionGeminiPlannerSurface,
  })],
};
export default narratagePackage;
