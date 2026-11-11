import { createNleHtmlVideoPackageFacet } from "@hypit/html-video";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";

import {
  textFineNleAuthoring,
  textFineNleHtmlVideoResolver,
  textFineNleManifest,
  textFineNleResolver,
} from "./nle-package.js";
import { textFineNlePresentation } from "./nle-presentation.js";
import { textFineNleInspector } from "./nle-inspector.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: textFineNleManifest }],
  facets: [
    createNlePackageFacet({ components: [textFineNleResolver] }),
    createNleHtmlVideoPackageFacet({ components: [textFineNleHtmlVideoResolver] }),
    createNleAuthoringFacet({ componentParameters: [textFineNleAuthoring] }),
    createNleTimelinePresentationFacet({ components: [textFineNlePresentation] }),
    createNleInspectorPresentationFacet({ components: [textFineNleInspector] }),
  ],
};
export default hypitPackage;
