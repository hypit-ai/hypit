import { createStudioAdapterHostFacet } from "@hypit/studio-adapter";
import { deckTrackStudioAdapters } from "./index.js";

export default {
  format: "hypit.node-package@1" as const,
  hostFacets: [createStudioAdapterHostFacet(deckTrackStudioAdapters)],
};
