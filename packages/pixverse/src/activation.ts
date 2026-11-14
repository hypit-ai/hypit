import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { pixverseComponent, pixverseManifest } from "./index.js";
import { pixverseAuthorDeclarations } from "./declaration.js";
import { pixverseGenerationFacets } from "./generation.js";
export const hypitPackage = { facets: [
    createModuleFacet(pixverseManifest), createGenerationModuleFacet(pixverseManifest),
  createProducerPackageFacet(pixverseComponent.producers ?? []),
  createRefinementPackageFacet(pixverseComponent.refinements ?? []),
  ...pixverseAuthorDeclarations.map(createAuthorDeclarationFacet),
  ...pixverseGenerationFacets,
] };
export default hypitPackage;
