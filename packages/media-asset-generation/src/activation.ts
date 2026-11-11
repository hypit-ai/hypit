import { createGenerationNodePackageFacet } from "@hypit/generation-graph";
import { createGenerationCanvasPresentationFacet } from "@hypit/generation-canvas";

import {
  mediaAssetGenerationManifest,
  mediaAssetGenerationNode,
  mediaAssetResourceGenerationNodes,
  mediaAssetGenerationPresentations,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mediaAssetGenerationManifest }],
  facets: [
    createGenerationNodePackageFacet({
      nodes: [mediaAssetGenerationNode, ...Object.values(mediaAssetResourceGenerationNodes)],
    }),
    createGenerationCanvasPresentationFacet({ nodes: mediaAssetGenerationPresentations }),
  ],
};

export default hypitPackage;
