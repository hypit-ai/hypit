import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { seedreamComponent, seedreamManifest, seedreamModuleRef } from "./index.js";
import { seedreamAuthorDeclarations, seedreamMarkupDeclarations } from "./declaration.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: seedreamManifest }], facets: [
  createProducerPackageFacet(seedreamComponent.producers ?? []),
  createRefinementPackageFacet(seedreamComponent.refinements ?? []),
  ...seedreamAuthorDeclarations.map(createAuthorDeclarationFacet),
  ...seedreamMarkupDeclarations.map((declaration) =>
    createMarkupDeclarationFacet({ module: seedreamModuleRef, declaration })),

] };
export default hypitPackage;
