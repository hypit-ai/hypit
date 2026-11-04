import { createProducerPackageFacet } from "@hypit/hypit/producer";

import { audioStretchComponent } from "./component.js";
import { audioStretchManifest, audioStretchModuleRef } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audioStretchManifest }],
  facets: [createProducerPackageFacet(audioStretchComponent.producers)],
};

export default hypitPackage;
