import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorAdopterFacet, createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { speechEvidenceComponent } from "./component.js";
import { speechTranscriptAuthorAdopter } from "./adoption.js";
import { speechTranscriptAuthorDeclaration, speechTranscriptMarkupDeclaration, speechEvidenceManifest, speechEvidenceModuleRef } from "./index.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: speechEvidenceManifest }],
  facets: [
    ...[speechEvidenceComponent].flatMap((component) => [
      createProducerPackageFacet(component.producers ?? []),
      createRefinementPackageFacet(component.refinements ?? []),
    ]),
    createAuthorDeclarationFacet(speechTranscriptAuthorDeclaration),
    createAuthorAdopterFacet(speechTranscriptAuthorAdopter),
    createMarkupDeclarationFacet({
      module: speechEvidenceModuleRef,
      declaration: speechTranscriptMarkupDeclaration,
    }),
  ],
};
export default hypitPackage;
