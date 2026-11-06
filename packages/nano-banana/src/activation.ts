import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { nanoBananaComponent, nanoBananaManifest } from "./index.js";
import { nanoBananaAuthorDeclarations } from "./declaration.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: nanoBananaManifest }], facets: [
  createProducerPackageFacet(nanoBananaComponent.producers ?? []),
  createRefinementPackageFacet(nanoBananaComponent.refinements ?? []),
  ...nanoBananaAuthorDeclarations.map(createAuthorDeclarationFacet),
] };
export default hypitPackage;
