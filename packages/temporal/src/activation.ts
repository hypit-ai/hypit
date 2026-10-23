import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { temporalManifest } from "./index.js";
import { temporalComponent } from "./component.js";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { commonTemporalStudioRelations } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: temporalManifest }],
  facets: [
    createProducerPackageFacet(temporalComponent.producers),
    createStudioCompanionFacet({ temporalRelations: commonTemporalStudioRelations }),
  ],
};
export default hypitPackage;
