import { createNleHtmlVideoPackageFacet } from "@hypit/html-video";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";

import {
  rankingBoardHtmlResolver,
  rankingBoardNleAuthoring,
  rankingBoardNleResolver,
  rankingDebateComponentsManifest,
  verdictBurstHtmlResolver,
  verdictBurstNleResolver,
} from "./nle-package.js";
import {
  rankingBoardNlePresentation,
  verdictBurstNlePresentation,
} from "./nle-presentation.js";
import { rankingBoardNleInspector, verdictBurstNleInspector } from "./nle-inspector.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: rankingDebateComponentsManifest }],
  facets: [
    createNlePackageFacet({ components: [rankingBoardNleResolver, verdictBurstNleResolver] }),
    createNleHtmlVideoPackageFacet({ components: [rankingBoardHtmlResolver, verdictBurstHtmlResolver] }),
    createNleAuthoringFacet({ componentParameters: [rankingBoardNleAuthoring] }),
    createNleTimelinePresentationFacet({
      components: [rankingBoardNlePresentation, verdictBurstNlePresentation],
    }),
    createNleInspectorPresentationFacet({
      components: [rankingBoardNleInspector, verdictBurstNleInspector],
    }),
  ],
};
export default hypitPackage;
