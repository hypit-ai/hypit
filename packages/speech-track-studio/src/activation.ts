import { createStudioTrackCompanionHostFacet } from "@hypit/studio-adapter";
import { speechTrackStudioTrackCompanions } from "./index.js";

export default {
  format: "hypit.node-package@1" as const,
  hostFacets: [createStudioTrackCompanionHostFacet(speechTrackStudioTrackCompanions)],
};
