import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { gptImageComponent, gptImageManifest } from "./index.js";
import { gptImageAuthorDeclarations } from "./declaration.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: gptImageManifest,
  }],
  facets: [
    ...[gptImageComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...gptImageAuthorDeclarations.map(createAuthorDeclarationFacet),
  ],
};
export default hypitPackage;
