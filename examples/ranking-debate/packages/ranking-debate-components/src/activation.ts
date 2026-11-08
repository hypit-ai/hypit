import { createNleHtmlVideoPackageFacet } from "@hypit/html-video";
import { createNlePackageFacet } from "@hypit/nle";

import {
  rankingBoardHtmlResolver,
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
  ],
};
export default hypitPackage;
