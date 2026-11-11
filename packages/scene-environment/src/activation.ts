import { createSceneAuthoringFacet } from "@hypit/scene";

import { worldEnvironmentAuthoring } from "./environment.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [],
  facets: [createSceneAuthoringFacet({ environmentParameters: [worldEnvironmentAuthoring] })],
};
export default hypitPackage;
