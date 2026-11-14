import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { grokImagineComponent, grokImagineManifest } from "./index.js";
import { grokImagineAuthorDeclarations } from "./declaration.js";
import { grokImagineGenerationFacets } from "./generation.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(grokImagineManifest), createGenerationModuleFacet(grokImagineManifest),
    ...[grokImagineComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...grokImagineAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...grokImagineGenerationFacets,
  ],
};
export default hypitPackage;
