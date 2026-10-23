import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { narrativeComponent, narrativeManifest } from "./index.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: narrativeManifest }],
  facets: [createRefinementPackageFacet(narrativeComponent.refinements)],
};
export default hypitPackage;
