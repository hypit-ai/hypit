import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import {
  decodeSpeechAlignmentSurface,
  speechAlignmentComponent,
  speechAlignmentManifest,
  speechAlignmentMarkupSurfaces,
  speechAlignmentModuleRef,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: speechAlignmentManifest }],
  facets: [
    createProducerPackageFacet(speechAlignmentComponent.producers),
    createMarkupSurfaceFacet({
      module: speechAlignmentModuleRef,
      declaration: speechAlignmentMarkupSurfaces.find((item) => item.name === "alignment")!,
      handler: decodeSpeechAlignmentSurface,
    }),
  ],
};
export default hypitPackage;
