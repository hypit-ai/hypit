import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { narrativeCaptionComponent, narrativeCaptionManifest, narrativeCaptionModuleRef, narrativeCaptionTimingAuthorDeclaration, narrativeCaptionTimingMarkupDeclaration } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: narrativeCaptionManifest }],
  facets: [
    ...[narrativeCaptionComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    createAuthorDeclarationFacet(narrativeCaptionTimingAuthorDeclaration),
    createMarkupDeclarationFacet({ module: narrativeCaptionModuleRef, declaration: narrativeCaptionTimingMarkupDeclaration }),
  ],
};
export default hypitPackage;
