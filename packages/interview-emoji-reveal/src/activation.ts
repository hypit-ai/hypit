import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { emojiRevealComponent, emojiRevealManifest, emojiRevealModuleRef } from "./index.js";
import { emojiRevealAuthorDeclarations, emojiRevealMarkupDeclarations } from "./declaration.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: emojiRevealManifest }],
  facets: [
    createProducerPackageFacet(emojiRevealComponent.producers ?? []),
    createRefinementPackageFacet(emojiRevealComponent.refinements ?? []),
    ...emojiRevealAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...emojiRevealMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: emojiRevealModuleRef, declaration })),

  ],
};
export default hypitPackage;
