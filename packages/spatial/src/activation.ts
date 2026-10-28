import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { spatialMarkupDeclarations } from "./declaration.js";
import {
  spatialManifest,
  spatialModuleRef,
} from "./manifest.js";
import { spatialComponent } from "./component.js";
import { spatialAuthorDeclarations } from "./declaration.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: spatialManifest }],
  facets: [
    ...[spatialComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...spatialAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...spatialMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: spatialModuleRef, declaration })),




  ],
};
export default hypitPackage;
