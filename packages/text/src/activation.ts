import { createRefinementPackageFacet } from "@hypit/refinement";

import { textComponent, textManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: textManifest }],
  facets: [createRefinementPackageFacet(textComponent.refinements ?? [])],
};

export default hypitPackage;
