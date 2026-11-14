import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { textComponent, textManifest } from "./index.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(textManifest), createGenerationModuleFacet(textManifest),createRefinementPackageFacet(textComponent.refinements ?? [])],
};

export default hypitPackage;
