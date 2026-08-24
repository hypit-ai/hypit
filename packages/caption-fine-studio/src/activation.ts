import { createStudioAdapterHostFacet } from "@hypit/studio-adapter";
import { captionFineStudioAdapters } from "./index.js";

export default {
  format: "hypit.node-package@1" as const,
  hostFacets: [createStudioAdapterHostFacet(captionFineStudioAdapters)],
};
