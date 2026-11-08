import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleHtmlVideoPackageFacet } from "@hypit/html-video";

import {
  titleCardNleAuthoring,
  titleCardNleHtmlVideoResolver,
  titleCardNleResolver,
} from "./nle.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [],
  facets: [
    createNlePackageFacet({ components: [titleCardNleResolver] }),
    createNleHtmlVideoPackageFacet({ components: [titleCardNleHtmlVideoResolver] }),
    createNleAuthoringFacet({ componentParameters: [titleCardNleAuthoring] }),
  ],
};

export default hypitPackage;
