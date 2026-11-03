import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { gptImageEditors } from "./studio.js";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { gptImageCleanManifest, gptImageComponent, gptImageManifest } from "./index.js";
import { gptImageAuthorDeclarations, gptImageMarkupDeclarations } from "./declaration.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: gptImageManifest,
  }, {
    manifest: gptImageCleanManifest,
  }],
  facets: [
    createStudioCompanionFacet({ declarationEditors: gptImageEditors }),
    ...[gptImageComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...gptImageAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...gptImageMarkupDeclarations.map(({ module, declaration }) =>
      createMarkupDeclarationFacet({ module, declaration })),

  ],
};
export default hypitPackage;
