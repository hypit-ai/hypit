import { compositionTypes } from "@hypit/composition";
import type { StudioFilmCompanion } from "@hypit/studio-companion";
import { timelineTypes } from "@hypit/timeline";

import { filmModuleRef } from "./manifest.js";

/** Film owns the author vocabulary that selects its time source and peer Tracks. */
export const filmStudioCompanions: readonly StudioFilmCompanion[] = [{
  id: "film",
  match: { module: filmModuleRef, surface: "film", outputType: compositionTypes.composition },
  timeSources: [{ attribute: "timeline", type: timelineTypes.timeline }],
  tracks: {
    childSurface: "Track",
    containerSurfaces: ["Stack"],
    sourceAttribute: "source",
    types: [compositionTypes.visualTrack, compositionTypes.audioTrack],
  },
}];
