import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { regionEvidenceAuthorDeclarations, regionEvidenceComponent, regionEvidenceManifest, regionEvidenceMarkupDeclarations, regionEvidenceModuleRef } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: regionEvidenceManifest }],
  facets: [
    ...[regionEvidenceComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...regionEvidenceAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...regionEvidenceMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: regionEvidenceModuleRef,
      declaration,
    })),
  ],
};
export default hypitPackage;
