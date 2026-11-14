import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { seedreamComponent, seedreamManifest } from "./index.js";
import { seedreamAuthorDeclarations } from "./declaration.js";
import { seedreamGenerationFacets } from "./generation.js";
export const hypitPackage = { facets: [
    createModuleFacet(seedreamManifest), createGenerationModuleFacet(seedreamManifest),
  createProducerPackageFacet(seedreamComponent.producers ?? []),
  createRefinementPackageFacet(seedreamComponent.refinements ?? []),
  ...seedreamAuthorDeclarations.map(createAuthorDeclarationFacet),
  ...seedreamGenerationFacets,
] };
export default hypitPackage;
