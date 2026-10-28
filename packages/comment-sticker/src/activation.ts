import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioTrackCompanionFacet } from "@hypit/studio-companion";
import { commentStickerComponent, commentStickerManifest, commentStickerModuleRef } from "./index.js";
import { commentStickerAuthorDeclarations, commentStickerMarkupDeclarations } from "./declaration.js";
import { commentStickerStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: commentStickerManifest,
  }],
  facets: [
    ...[commentStickerComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...commentStickerAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...commentStickerMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: commentStickerModuleRef, declaration })),

    createStudioTrackCompanionFacet(commentStickerStudioTrackCompanions),
  ],
};

export default hypitPackage;
