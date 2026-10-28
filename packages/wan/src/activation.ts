import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { wanComponent, wanManifest, wanModuleRef } from "./index.js";
import { wanAuthorDeclarations, wanMarkupDeclarations } from "./declaration.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: wanManifest }], facets: [
  createProducerPackageFacet(wanComponent.producers ?? []),
  createRefinementPackageFacet(wanComponent.refinements ?? []),
  ...wanAuthorDeclarations.map(createAuthorDeclarationFacet),
  ...wanMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({ module: wanModuleRef, declaration })),

] };
export default hypitPackage;
