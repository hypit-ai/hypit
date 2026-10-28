import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { imageOperationsAuthorDeclarations, imageComposeComponent, imageTransformComponent, imageOperationsManifest, imageOperationsMarkupDeclarations, imageOperationsModuleRef } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: imageOperationsManifest,
  }],
  facets: [
    ...[imageTransformComponent, imageComposeComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...imageOperationsAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...imageOperationsMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: imageOperationsModuleRef,
      declaration,
    })),

  ],
};

export default hypitPackage;
