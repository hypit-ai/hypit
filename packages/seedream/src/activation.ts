import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { seedreamComponent, seedreamManifest } from "./index.js";
import { seedreamAuthorDeclarations } from "./declaration.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: seedreamManifest }], facets: [
  createProducerPackageFacet(seedreamComponent.producers ?? []),
  createRefinementPackageFacet(seedreamComponent.refinements ?? []),
  ...seedreamAuthorDeclarations.map(createAuthorDeclarationFacet),
] };
export default hypitPackage;
