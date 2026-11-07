import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { audiovisualHtmlComponent } from "./component.js";
import { audiovisualHtmlManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audiovisualHtmlManifest }],
  facets: [
    createProducerPackageFacet(audiovisualHtmlComponent.producers),
    createRefinementPackageFacet(audiovisualHtmlComponent.refinements),
  ],
};

export default hypitPackage;
