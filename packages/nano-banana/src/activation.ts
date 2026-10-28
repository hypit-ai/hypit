import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { nanoBananaComponent, nanoBananaManifest, nanoBananaModuleRef } from "./index.js";
import { nanoBananaAuthorDeclarations, nanoBananaMarkupDeclarations } from "./declaration.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: nanoBananaManifest }], facets: [
  createProducerPackageFacet(nanoBananaComponent.producers ?? []),
  createRefinementPackageFacet(nanoBananaComponent.refinements ?? []),
  ...nanoBananaAuthorDeclarations.map(createAuthorDeclarationFacet),
  ...nanoBananaMarkupDeclarations.map((declaration) =>
    createMarkupDeclarationFacet({ module: nanoBananaModuleRef, declaration })),

] };
export default hypitPackage;
