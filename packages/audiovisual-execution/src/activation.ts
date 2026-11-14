import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { audiovisualExecutionComponent } from "./component.js";
import { audiovisualExecutionManifest } from "./manifest.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(audiovisualExecutionManifest), createGenerationModuleFacet(audiovisualExecutionManifest),createRefinementPackageFacet(audiovisualExecutionComponent.refinements)],
};

export default hypitPackage;
