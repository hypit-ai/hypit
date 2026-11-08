import { createGenerationNodePackageFacet } from "@hypit/generation-graph";

import {
  mediaAssetGenerationNode,
  mediaAssetManifest,
} from "./generation.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mediaAssetManifest }],
  facets: [createGenerationNodePackageFacet({ nodes: [mediaAssetGenerationNode] })],
};

export default hypitPackage;
