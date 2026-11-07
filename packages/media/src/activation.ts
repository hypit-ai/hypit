import { createRefinementPackageFacet } from "@hypit/refinement";
import { createProducerPackageFacet } from "@hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/author";
import { mediaComponent, mediaAuthorDeclarations, mediaManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mediaManifest }],
  facets: [
    ...[mediaComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...mediaAuthorDeclarations.map(createAuthorDeclarationFacet),
  ],
};

export default hypitPackage;
