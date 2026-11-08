import { createNleHtmlVideoPackageFacet } from "@hypit/html-video";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";

import {
  captionFineNleHtmlVideoResolver,
  captionFineNleAuthoring,
  captionFineNleManifest,
  captionFineNleResolver,
} from "./nle-package.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: captionFineNleManifest }],
  facets: [
    createNlePackageFacet({ components: [captionFineNleResolver] }),
    createNleHtmlVideoPackageFacet({ components: [captionFineNleHtmlVideoResolver] }),
    createNleAuthoringFacet({ componentParameters: [captionFineNleAuthoring] }),
  ],
};
export default hypitPackage;
