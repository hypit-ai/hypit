import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { seedanceComponent, seedanceManifest } from "./index.js";
import { seedanceAuthorDeclarations } from "./declaration.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: seedanceManifest }],
  facets: [
    ...[seedanceComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...seedanceAuthorDeclarations.map(createAuthorDeclarationFacet),
  ],
};

export default hypitPackage;
