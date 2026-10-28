import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { pixverseComponent, pixverseManifest, pixverseModuleRef } from "./index.js";
import { pixverseAuthorDeclarations, pixverseMarkupDeclarations } from "./declaration.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: pixverseManifest }], facets: [
  createProducerPackageFacet(pixverseComponent.producers ?? []),
  createRefinementPackageFacet(pixverseComponent.refinements ?? []),
  ...pixverseAuthorDeclarations.map(createAuthorDeclarationFacet),
  ...pixverseMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({ module: pixverseModuleRef, declaration })),

] };
export default hypitPackage;
