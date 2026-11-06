import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { minimaxH3Component, minimaxH3Manifest } from "./index.js";
import { minimaxH3AuthorDeclarations } from "./declaration.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: minimaxH3Manifest }], facets: [
  createProducerPackageFacet(minimaxH3Component.producers ?? []),
  createRefinementPackageFacet(minimaxH3Component.refinements ?? []),
  ...minimaxH3AuthorDeclarations.map(createAuthorDeclarationFacet),
] };
export default hypitPackage;
