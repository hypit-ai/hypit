import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { speechEvidenceComponent } from "./component.js";
import {
  decodeSpeechTranscriptSurface,
  speechEvidenceManifest,
  speechEvidenceMarkupSurfaces,
  speechEvidenceModuleRef,
} from "./index.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: speechEvidenceManifest }],
  facets: [
    ...[speechEvidenceComponent].flatMap((component) => [
      createProducerPackageFacet(component.producers ?? []),
      createRefinementPackageFacet(component.refinements ?? []),
    ]),
    createMarkupSurfaceFacet({
      module: speechEvidenceModuleRef,
      declaration: speechEvidenceMarkupSurfaces.find((item) => item.name === "transcript")!,
      handler: decodeSpeechTranscriptSurface,
    }),
  ],
};
export default hypitPackage;
