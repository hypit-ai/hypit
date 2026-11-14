import { createSceneAuthoringFacet, createScenePackageFacet } from "@hypit/scene";

import { cameraMotionAuthoring, sceneMotionPackage } from "./motion.js";

export const hypitPackage = {
  facets: [
    createScenePackageFacet(sceneMotionPackage),
    createSceneAuthoringFacet({ behaviorParameters: [cameraMotionAuthoring] }),
  ],
};
export default hypitPackage;
