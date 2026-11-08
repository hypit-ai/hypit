import { createNleHtmlVideoPackageFacet } from "@hypit/html-video";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";

import {
  rankingBoardHtmlResolver,
  rankingBoardNleAuthoring,
  rankingBoardNleResolver,
  rankingDebateComponentsManifest,
  verdictBurstHtmlResolver,
  verdictBurstNleResolver,
} from "./nle-package.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: rankingDebateComponentsManifest }],
  facets: [
    createNlePackageFacet({ components: [rankingBoardNleResolver, verdictBurstNleResolver] }),
    createNleHtmlVideoPackageFacet({ components: [rankingBoardHtmlResolver, verdictBurstHtmlResolver] }),
    createNleAuthoringFacet({ componentParameters: [rankingBoardNleAuthoring] }),
  ],
};
export default hypitPackage;
