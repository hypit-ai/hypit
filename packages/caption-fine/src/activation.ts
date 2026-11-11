import { createNleHtmlVideoPackageFacet } from "@hypit/html-video";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";

import {
  captionFineNleHtmlVideoResolver,
  captionFineNleAuthoring,
  captionFineNleManifest,
  captionFineNleResolver,
} from "./nle-package.js";
import { captionFineNlePresentation } from "./nle-presentation.js";
import { captionFineNleInspector } from "./nle-inspector.js";
import { captionFineStyleNleAuthoring, captionFineStyleNleInspector } from "./nle-style.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: captionFineNleManifest }],
  facets: [
    createNlePackageFacet({ components: [captionFineNleResolver] }),
    createNleHtmlVideoPackageFacet({ components: [captionFineNleHtmlVideoResolver] }),
    createNleAuthoringFacet({
      componentParameters: [captionFineNleAuthoring],
      componentValues: [captionFineStyleNleAuthoring],
    }),
    createNleTimelinePresentationFacet({ components: [captionFineNlePresentation] }),
    createNleInspectorPresentationFacet({
      components: [captionFineNleInspector],
      componentValues: [captionFineStyleNleInspector],
    }),
  ],
};
export default hypitPackage;
