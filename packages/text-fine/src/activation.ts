import { createNleHtmlVideoPackageFacet } from "@hypit/html-video";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";

import {
  textFineNleAuthoring,
  textFineNleHtmlVideoResolver,
  textFineNleManifest,
  textFineNleResolver,
} from "./nle-package.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: textFineNleManifest }],
  facets: [
    createNlePackageFacet({ components: [textFineNleResolver] }),
    createNleHtmlVideoPackageFacet({ components: [textFineNleHtmlVideoResolver] }),
    createNleAuthoringFacet({ componentParameters: [textFineNleAuthoring] }),
  ],
};
export default hypitPackage;
