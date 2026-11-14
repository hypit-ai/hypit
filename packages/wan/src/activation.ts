import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { wanComponent, wanManifest } from "./index.js";
import { wanAuthorDeclarations } from "./declaration.js";
import { wanGenerationFacets } from "./generation.js";
export const hypitPackage = { facets: [
    createModuleFacet(wanManifest), createGenerationModuleFacet(wanManifest),
  createProducerPackageFacet(wanComponent.producers ?? []),
  createRefinementPackageFacet(wanComponent.refinements ?? []),
  ...wanAuthorDeclarations.map(createAuthorDeclarationFacet),
  ...wanGenerationFacets,
] };
export default hypitPackage;
