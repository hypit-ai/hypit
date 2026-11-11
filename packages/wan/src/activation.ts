import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { wanComponent, wanManifest } from "./index.js";
import { wanAuthorDeclarations } from "./declaration.js";
import { wanGenerationFacets } from "./generation.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: wanManifest }], facets: [
  createProducerPackageFacet(wanComponent.producers ?? []),
  createRefinementPackageFacet(wanComponent.refinements ?? []),
  ...wanAuthorDeclarations.map(createAuthorDeclarationFacet),
  ...wanGenerationFacets,
] };
export default hypitPackage;
