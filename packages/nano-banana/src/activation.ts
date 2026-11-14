import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { nanoBananaComponent, nanoBananaManifest } from "./index.js";
import { nanoBananaAuthorDeclarations } from "./declaration.js";
import { nanoBananaGenerationFacets } from "./generation.js";
export const hypitPackage = { facets: [
    createModuleFacet(nanoBananaManifest), createGenerationModuleFacet(nanoBananaManifest),
  createProducerPackageFacet(nanoBananaComponent.producers ?? []),
  createRefinementPackageFacet(nanoBananaComponent.refinements ?? []),
  ...nanoBananaAuthorDeclarations.map(createAuthorDeclarationFacet),
  ...nanoBananaGenerationFacets,
] };
export default hypitPackage;
