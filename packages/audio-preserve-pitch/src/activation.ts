import { createProducerPackageFacet } from "@hypit/hypit/producer";

import { audioPreservePitchComponent } from "./component.js";
import { audioPreservePitchManifest, audioPreservePitchModuleRef } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audioPreservePitchManifest }],
  facets: [createProducerPackageFacet(audioPreservePitchComponent.producers)],
};

export default hypitPackage;
