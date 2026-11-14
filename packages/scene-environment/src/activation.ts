import { createSceneAuthoringFacet } from "@hypit/scene";

import { worldEnvironmentAuthoring } from "./environment.js";

export const hypitPackage = {
  facets: [createSceneAuthoringFacet({ environmentParameters: [worldEnvironmentAuthoring] })],
};
export default hypitPackage;
