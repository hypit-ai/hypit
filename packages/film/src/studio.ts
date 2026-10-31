import { compositionTypes } from "@hypit/composition";
import type { StudioFilmCompanion } from "@hypit/studio-companion";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { filmModuleRef } from "./manifest.js";

/** Film owns the author vocabulary that selects its time source and peer Tracks. */
export const filmStudioCompanions: readonly StudioFilmCompanion[] = [{
  id: "film",
  match: { module: filmModuleRef, declaration: "film", outputType: compositionTypes.composition },
  timeSources: [{ attribute: "timeline", type: timelineTypes.timeline }],
  tracks: {
    childDeclaration: "Track",
    containerDeclarations: ["Stack"],
    sourceAttribute: "source",
    types: [compositionTypes.visualTrack, compositionTypes.audioTrack],
  },
  compounds: {
    childDeclaration: "Compound", idAttribute: "id", sourceAttribute: "source", placementAttribute: "at",
    sourceType: compositionTypes.composition, placementType: temporalTypes.instant,
  },
  links: {
    childDeclaration: "Link", idAttribute: "id", memberDeclaration: "Member",
    sourceAttribute: "source", clipAttribute: "clip",
  },
}];
