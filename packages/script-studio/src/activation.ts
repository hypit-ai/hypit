import { createStudioCompanionHostFacet } from "@hypit/studio-adapter";

import { scriptStudioCompanions } from "./index.js";

export default {
  format: "hypit.node-package@1" as const,
  hostFacets: [createStudioCompanionHostFacet({ scripts: scriptStudioCompanions })],
};
