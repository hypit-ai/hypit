import { createSceneAuthoringFacet, createScenePackageFacet } from "@hypit/scene";

import { cameraMotionAuthoring, sceneMotionPackage } from "./motion.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [],
  facets: [
    createScenePackageFacet(sceneMotionPackage),
    createSceneAuthoringFacet({ behaviorParameters: [cameraMotionAuthoring] }),
  ],
};
export default hypitPackage;
