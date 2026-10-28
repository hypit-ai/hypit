import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { htmlDocumentManifest, htmlDocumentModuleRef } from "./manifest.js";
import { htmlDocumentComponent } from "./component.js";
import { htmlDocumentMarkupDeclarations } from "./declaration.js";
import { htmlDocumentAuthorDeclarations } from "./declaration.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: htmlDocumentManifest }],
  facets: [
    ...htmlDocumentAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...htmlDocumentMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: htmlDocumentModuleRef,
      declaration,
    })),
    createProducerPackageFacet(htmlDocumentComponent.producers ?? []),
    createRefinementPackageFacet(htmlDocumentComponent.refinements ?? []),
  ],
};
export default hypitPackage;
