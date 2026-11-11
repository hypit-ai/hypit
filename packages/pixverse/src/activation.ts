import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { pixverseComponent, pixverseManifest } from "./index.js";
import { pixverseAuthorDeclarations } from "./declaration.js";
import { pixverseGenerationFacets } from "./generation.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: pixverseManifest }], facets: [
  createProducerPackageFacet(pixverseComponent.producers ?? []),
  createRefinementPackageFacet(pixverseComponent.refinements ?? []),
  ...pixverseAuthorDeclarations.map(createAuthorDeclarationFacet),
  ...pixverseGenerationFacets,
] };
export default hypitPackage;
