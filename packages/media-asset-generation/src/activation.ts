import { createGenerationNodePackageFacet } from "@hypit/generation-graph";

import {
  mediaAssetGenerationManifest,
  mediaAssetGenerationNode,
  mediaAssetResourceGenerationNode,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mediaAssetGenerationManifest }],
  facets: [createGenerationNodePackageFacet({
    nodes: [mediaAssetGenerationNode, mediaAssetResourceGenerationNode],
  })],
};

export default hypitPackage;
