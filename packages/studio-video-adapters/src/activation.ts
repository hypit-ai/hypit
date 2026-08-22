import { createStudioAdapterHostFacet } from "@hypit/studio-adapter";

import { videoStudioAdapters } from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [createStudioAdapterHostFacet(videoStudioAdapters)],
};

export default hypitPackage;
