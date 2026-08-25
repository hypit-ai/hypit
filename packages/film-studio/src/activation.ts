import { createStudioCompanionHostFacet } from "@hypit/studio-adapter";

import { filmStudioCompanions } from "./index.js";

export default {
  format: "hypit.node-package@1" as const,
  hostFacets: [createStudioCompanionHostFacet({ films: filmStudioCompanions })],
};
