import { createRefinementPackageFacet } from "@hypit/refinement";
import { spatialManifest } from "./manifest.js";
import { spatialComponent } from "./component.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: spatialManifest }],
  facets: [createRefinementPackageFacet(spatialComponent.refinements)],
};
export default hypitPackage;
