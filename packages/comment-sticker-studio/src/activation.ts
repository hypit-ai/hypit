import { createStudioTrackCompanionHostFacet } from "@hypit/studio-adapter";
import { commentStickerStudioTrackCompanions } from "./index.js";

export default {
  format: "hypit.node-package@1" as const,
  hostFacets: [createStudioTrackCompanionHostFacet(commentStickerStudioTrackCompanions)],
};
