import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createNleAudiovisualPackageFacet } from "@hypit/nle-audiovisual";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";

import {
  rankingBoardHtmlResolver,
  rankingBoardNleMediaAuthoring,
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
  facets: [
    createModuleFacet(rankingDebateComponentsManifest), createGenerationModuleFacet(rankingDebateComponentsManifest),
    createNlePackageFacet({ components: [rankingBoardNleResolver, verdictBurstNleResolver] }),
    createNleAudiovisualPackageFacet({ components: [rankingBoardHtmlResolver, verdictBurstHtmlResolver] }),
    createNleAuthoringFacet({
      componentParameters: [rankingBoardNleAuthoring],
      componentMedia: [rankingBoardNleMediaAuthoring],
    }),
    createNleTimelinePresentationFacet({
      components: [rankingBoardNlePresentation, verdictBurstNlePresentation],
    }),
    createNleInspectorPresentationFacet({
      components: [rankingBoardNleInspector, verdictBurstNleInspector],
    }),
  ],
};
export default hypitPackage;
