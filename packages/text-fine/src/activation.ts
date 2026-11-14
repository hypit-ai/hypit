import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createNleAudiovisualPackageFacet } from "@hypit/nle-audiovisual";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";

import {
  textFineNleAuthoring,
  textFineNleAudiovisualResolver,
  textFineNleManifest,
  textFineNleResolver,
} from "./nle-package.js";
import { textFineNlePresentation } from "./nle-presentation.js";
import { textFineNleInspector } from "./nle-inspector.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(textFineNleManifest), createGenerationModuleFacet(textFineNleManifest),
    createNlePackageFacet({ components: [textFineNleResolver] }),
    createNleAudiovisualPackageFacet({ components: [textFineNleAudiovisualResolver] }),
    createNleAuthoringFacet({ componentParameters: [textFineNleAuthoring] }),
    createNleTimelinePresentationFacet({ components: [textFineNlePresentation] }),
    createNleInspectorPresentationFacet({ components: [textFineNleInspector] }),
  ],
};
export default hypitPackage;
