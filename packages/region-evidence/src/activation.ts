import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";

import {
  decodeRegionEvidenceSurface,
  regionEvidenceComponent,
  regionEvidenceManifest,
  regionEvidenceMarkupSurface,
  regionEvidenceModuleRef,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: regionEvidenceManifest }],
  facets: [
    ...[regionEvidenceComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)]),createMarkupSurfaceFacet({
    module: regionEvidenceModuleRef,
    declaration: regionEvidenceMarkupSurface,
    handler: decodeRegionEvidenceSurface,
  })],
};
export default hypitPackage;
