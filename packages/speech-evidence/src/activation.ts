import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createProductExporterFacet } from "@hypit/hypit/product";
import { createMediaRepresentationFacet } from "@hypit/media-asset";
import type { SpeechTranscriptEvidence } from "./index.js";
import { speechEvidenceComponent } from "./component.js";
import { encodeSpeechTranscriptEvidence, speechEvidenceMediaRepresentationPackage, speechEvidenceManifest, speechEvidenceTypes } from "./index.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: speechEvidenceManifest }],
  facets: [
    ...[speechEvidenceComponent].flatMap((component) => [
      createProducerPackageFacet(component.producers ?? []),
      createRefinementPackageFacet(component.refinements ?? []),
    ]),
    createProductExporterFacet({
      type: speechEvidenceTypes.transcript,
      export({ value }) {
        const document = encodeSpeechTranscriptEvidence(value as unknown as SpeechTranscriptEvidence);
        return { bytes: new TextEncoder().encode(document) };
      },
    }),
    createMediaRepresentationFacet(speechEvidenceMediaRepresentationPackage),
  ],
};
export default hypitPackage;
