import { createModuleFacet } from "@hypit/hypit/module";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleAudiovisualPackageFacet } from "@hypit/nle-audiovisual";

import { titleCardModuleRef } from "./identity.js";
import {
  titleCardNleAuthoring,
  titleCardNleAudiovisualResolver,
  titleCardNleResolver,
} from "./nle.js";

export const hypitPackage = {
  facets: [
    createModuleFacet({
      ...titleCardModuleRef,
      dependencies: [],
      types: [],
    }),
    createNlePackageFacet({ components: [titleCardNleResolver] }),
    createNleAudiovisualPackageFacet({ components: [titleCardNleAudiovisualResolver] }),
    createNleAuthoringFacet({ componentParameters: [titleCardNleAuthoring] }),
  ],
};

export default hypitPackage;
