import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { volcengineMattingAuthorDeclarations, volcengineMattingDefinition } from "./index.js";
import { portraitMattingGenerationFacets } from "./generation.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(volcengineMattingDefinition.manifest), createGenerationModuleFacet(volcengineMattingDefinition.manifest),
    ...[volcengineMattingDefinition.component].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...volcengineMattingAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...portraitMattingGenerationFacets,
    ],
};
export default hypitPackage;
