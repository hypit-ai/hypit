import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { compositionComponent, compositionManifest } from "./index.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: compositionManifest }],
  facets: [createRefinementPackageFacet(compositionComponent)],
};
export default hypitPackage;
