import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { captionComponent, captionManifest, captionModuleRef, hiddenCaptionStyleAuthorDeclaration, hiddenCaptionStyleMarkupDeclaration } from "./index.js";
import { captionDocumentAuthorDeclaration, captionDocumentMarkupDeclaration } from "./document-declaration.js";
import { captionTimingAuthorDeclaration, captionTimingMarkupDeclaration } from "./timing-declaration.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: captionManifest }],
  facets: [
    ...[captionComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    createAuthorDeclarationFacet(hiddenCaptionStyleAuthorDeclaration),
    createAuthorDeclarationFacet(captionDocumentAuthorDeclaration),
    createAuthorDeclarationFacet(captionTimingAuthorDeclaration),
    createMarkupDeclarationFacet({ module: captionModuleRef, declaration: captionTimingMarkupDeclaration }),
    createMarkupDeclarationFacet({ module: captionModuleRef, declaration: captionDocumentMarkupDeclaration }),
    createMarkupDeclarationFacet({ module: captionModuleRef, declaration: hiddenCaptionStyleMarkupDeclaration }),
  ],
};
export default hypitPackage;
