import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { mediaComponent, mediaAuthorDeclarations, mediaManifest, mediaMarkupDeclarations, mediaModuleRef } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mediaManifest }],
  facets: [
    ...[mediaComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...mediaAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...mediaMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: mediaModuleRef, declaration })),


  ],
};

export default hypitPackage;
