import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";

import { titleCardComponent } from "./component.js";
import { titleCardAuthorFacet } from "./declaration.js";
import { titleCardHtmlManifest, titleCardManifest } from "./manifest.js";
import { titleCardNleAuthoring, titleCardNleResolver } from "./nle.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: titleCardManifest }, { manifest: titleCardHtmlManifest }],
  facets: [
    createProducerPackageFacet(titleCardComponent.producers),
    createRefinementPackageFacet(titleCardComponent.refinements),
    titleCardAuthorFacet,
    createNlePackageFacet({ components: [titleCardNleResolver] }),
    createNleAuthoringFacet({ componentParameters: [titleCardNleAuthoring] }),
  ],
};

export default hypitPackage;
