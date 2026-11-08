import { createNleHtmlVideoPackageFacet } from "@hypit/html-video";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";

import {
  captionBasicNleHtmlVideoResolver,
  captionBasicNleAuthoring,
  captionBasicNleManifest,
  captionBasicNleResolver,
} from "./nle-package.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: captionBasicNleManifest }],
  facets: [
    createNlePackageFacet({ components: [captionBasicNleResolver] }),
    createNleHtmlVideoPackageFacet({ components: [captionBasicNleHtmlVideoResolver] }),
    createNleAuthoringFacet({ componentParameters: [captionBasicNleAuthoring] }),
  ],
};
export default hypitPackage;
