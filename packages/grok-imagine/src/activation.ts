import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { grokImagineComponent, grokImagineManifest } from "./index.js";
import { grokImagineAuthorDeclarations } from "./declaration.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: grokImagineManifest }],
  facets: [
    ...[grokImagineComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...grokImagineAuthorDeclarations.map(createAuthorDeclarationFacet),
  ],
};
export default hypitPackage;
