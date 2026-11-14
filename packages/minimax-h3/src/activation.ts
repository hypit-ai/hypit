import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { minimaxH3Component, minimaxH3Manifest } from "./index.js";
import { minimaxH3AuthorDeclarations } from "./declaration.js";
import { minimaxH3GenerationFacets } from "./generation.js";
export const hypitPackage = { facets: [
    createModuleFacet(minimaxH3Manifest), createGenerationModuleFacet(minimaxH3Manifest),
  createProducerPackageFacet(minimaxH3Component.producers ?? []),
  createRefinementPackageFacet(minimaxH3Component.refinements ?? []),
  ...minimaxH3AuthorDeclarations.map(createAuthorDeclarationFacet),
  ...minimaxH3GenerationFacets,
] };
export default hypitPackage;
