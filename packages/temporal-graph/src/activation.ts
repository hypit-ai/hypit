import { createRefinementPackageFacet } from "@hypit/refinement";

import { temporalManifest } from "./manifest.js";
import { temporalRefinements } from "./refinement.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: temporalManifest }],
  facets: [createRefinementPackageFacet(temporalRefinements)],
};

export default hypitPackage;
