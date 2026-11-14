import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createNleAudiovisualPackageFacet } from "@hypit/nle-audiovisual";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";

import {
  captionFineNleAudiovisualResolver,
  captionFineNleAuthoring,
  captionFineNleManifest,
  captionFineNleResolver,
} from "./nle-package.js";
import { captionFineNlePresentation } from "./nle-presentation.js";
import { captionFineNleInspector } from "./nle-inspector.js";
import { captionFineStyleNleAuthoring, captionFineStyleNleInspector } from "./nle-style.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(captionFineNleManifest), createGenerationModuleFacet(captionFineNleManifest),
    createNlePackageFacet({ components: [captionFineNleResolver] }),
    createNleAudiovisualPackageFacet({ components: [captionFineNleAudiovisualResolver] }),
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
