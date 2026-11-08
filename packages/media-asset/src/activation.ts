import { createGenerationNodePackageFacet } from "@hypit/generation-graph";

import {
  mediaAssetGenerationNode,
  mediaAssetResourceGenerationNode,
  mediaAssetManifest,
} from "./generation.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mediaAssetManifest }],
  facets: [createGenerationNodePackageFacet({
    nodes: [mediaAssetGenerationNode, mediaAssetResourceGenerationNode],
  })],
};

export default hypitPackage;
