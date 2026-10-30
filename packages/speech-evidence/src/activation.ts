import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createResultOutputExporterFacet } from "@hypit/hypit/result";
import type { SpeechTranscriptEvidence } from "./index.js";
import { speechEvidenceComponent } from "./component.js";
import { speechTranscriptAuthorDeclaration, speechTranscriptMarkupDeclaration, speechEvidenceManifest, speechEvidenceModuleRef, speechEvidenceTypes, speechTranscriptSource } from "./index.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: speechEvidenceManifest }],
  facets: [
    ...[speechEvidenceComponent].flatMap((component) => [
      createProducerPackageFacet(component.producers ?? []),
      createRefinementPackageFacet(component.refinements ?? []),
    ]),
    createAuthorDeclarationFacet(speechTranscriptAuthorDeclaration),
    createMarkupDeclarationFacet({
      module: speechEvidenceModuleRef,
      declaration: speechTranscriptMarkupDeclaration,
    }),
    createResultOutputExporterFacet({
      type: speechEvidenceTypes.transcript,
      export({ value }) {
        const source = speechTranscriptSource("transcript", value as unknown as SpeechTranscriptEvidence);
        return { bytes: new TextEncoder().encode(source) };
      },
    }),
  ],
};
export default hypitPackage;
