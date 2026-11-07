import { createProducerPackageFacet } from "@hypit/producer";

import { audiovisualMediaComponent } from "./component.js";
import { audiovisualMediaAuthorFacets } from "./declaration.js";
import { audiovisualMediaManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audiovisualMediaManifest }],
  facets: [
    createProducerPackageFacet(audiovisualMediaComponent.producers),
    ...audiovisualMediaAuthorFacets,
  ],
};

export default hypitPackage;
