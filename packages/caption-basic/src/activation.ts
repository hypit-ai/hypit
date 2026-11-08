import { createNleHtmlVideoPackageFacet } from "@hypit/html-video";
import { createNlePackageFacet } from "@hypit/nle";

import { captionBasicNleHtmlVideoResolver, captionBasicNleResolver } from "./nle-package.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [],
  facets: [
    createNlePackageFacet({ components: [captionBasicNleResolver] }),
    createNleHtmlVideoPackageFacet({ components: [captionBasicNleHtmlVideoResolver] }),
  ],
};
export default hypitPackage;
