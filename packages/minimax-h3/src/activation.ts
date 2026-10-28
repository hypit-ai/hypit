import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { minimaxH3Component, minimaxH3Manifest, minimaxH3ModuleRef } from "./index.js";
import { minimaxH3AuthorDeclarations, minimaxH3MarkupDeclarations } from "./declaration.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: minimaxH3Manifest }], facets: [
  createProducerPackageFacet(minimaxH3Component.producers ?? []),
  createRefinementPackageFacet(minimaxH3Component.refinements ?? []),
  ...minimaxH3AuthorDeclarations.map(createAuthorDeclarationFacet),
  ...minimaxH3MarkupDeclarations.map((declaration) =>
    createMarkupDeclarationFacet({ module: minimaxH3ModuleRef, declaration })),

] };
export default hypitPackage;
