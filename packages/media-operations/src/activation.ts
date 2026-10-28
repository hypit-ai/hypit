import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createRunFragmentFacet } from "@hypit/hypit/run";
import { mediaOperationsAuthorDeclarations, mediaOperationsComponent, mediaOperationsManifest, mediaOperationsMarkupDeclarations, mediaOperationsModuleRef, stillVideoFragment } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mediaOperationsManifest }],
  facets: [
    ...[mediaOperationsComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    createRunFragmentFacet({
      name: "@hypit/media-operations@1",
      fragments: { "still-video": stillVideoFragment },
    }),
    ...mediaOperationsAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...mediaOperationsMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: mediaOperationsModuleRef,
      declaration,
    })),


  ],
};
export default hypitPackage;
