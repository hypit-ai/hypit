import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { temporalManifest } from "./manifest.js";
import { temporalRefinements } from "./refinement.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(temporalManifest), createGenerationModuleFacet(temporalManifest),createRefinementPackageFacet(temporalRefinements)],
};

export default hypitPackage;
