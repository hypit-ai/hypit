import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createGenerationNodePackageFacet } from "@hypit/generation-graph";
import { createGenerationCanvasPresentationFacet } from "@hypit/generation-canvas";

import {
  mediaAssetGenerationManifest,
  mediaAssetGenerationNode,
  mediaAssetResourceGenerationNodes,
  mediaAssetGenerationPresentations,
} from "./index.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(mediaAssetGenerationManifest), createGenerationModuleFacet(mediaAssetGenerationManifest),
    createGenerationNodePackageFacet({
      nodes: [mediaAssetGenerationNode, ...Object.values(mediaAssetResourceGenerationNodes)],
    }),
    createGenerationCanvasPresentationFacet({ nodes: mediaAssetGenerationPresentations }),
  ],
};

export default hypitPackage;
