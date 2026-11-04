import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import { titleCardComponent } from "./component.js";
import { titleCardHtmlManifest, titleCardManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: titleCardManifest }, { manifest: titleCardHtmlManifest }],
  facets: [
    createProducerPackageFacet(titleCardComponent.producers),
    createRefinementPackageFacet(titleCardComponent.refinements),
  ],
};

export default hypitPackage;
