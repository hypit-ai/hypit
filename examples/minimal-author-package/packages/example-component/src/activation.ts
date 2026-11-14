import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/generation/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { exampleAuthorDeclarations, exampleComponent, exampleManifest, exampleMarkupDeclarations, exampleModuleRef } from "./index.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(exampleManifest), createGenerationModuleFacet(exampleManifest),
    createProducerPackageFacet(exampleComponent.producers ?? []),
    createRefinementPackageFacet(exampleComponent.refinements ?? []),
    ...exampleAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...exampleMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({ module: exampleModuleRef, declaration })),
  ],
};
export default hypitPackage;
