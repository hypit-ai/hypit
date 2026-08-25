import { createStudioTrackCompanionHostFacet } from "@hypit/studio-adapter";
import { screenOverlayStudioTrackCompanions } from "./index.js";

export default {
  format: "hypit.node-package@1" as const,
  hostFacets: [createStudioTrackCompanionHostFacet(screenOverlayStudioTrackCompanions)],
};
