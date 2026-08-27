import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import { createRunFragmentHostFacet } from "@hypit/run";

import {
  decodeSemanticTakeEstimateSurface,
  semanticTakeEstimateComponent,
  semanticTakeEstimateManifest,
  semanticTakeEstimateMarkupSurfaces,
  semanticTakeEstimateModuleRef,
} from "./index.js";
import { semanticTakeEstimateFragment } from "./fragment.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: semanticTakeEstimateManifest }],
  components: [semanticTakeEstimateComponent],
  hostFacets: [createRunFragmentHostFacet({
    name: "@hypit/semantic-take-estimate@1",
    fragments: { "semantic-take": semanticTakeEstimateFragment },
  }), createMarkupSurfaceHostFacet({
    module: semanticTakeEstimateModuleRef,
    declaration: semanticTakeEstimateMarkupSurfaces.find((item) => item.name === "semantic-take")!,
    handler: decodeSemanticTakeEstimateSurface,
  })],
};

export default hypitPackage;
