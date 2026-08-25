import type { StudioFilmCompanion } from "@hypit/studio-adapter";
import { compositionTypes } from "@hypit/composition";
import { filmModuleRef } from "@hypit/film";
import { semanticTrackTypes } from "@hypit/semantic-track";

/** Film alone owns the author vocabulary that selects one semantic axis and its peer Tracks. */
export const filmStudioCompanions: readonly StudioFilmCompanion[] = [{
  id: "film",
  match: { module: filmModuleRef, surface: "film", outputType: compositionTypes.composition },
  semantic: { attribute: "semantic", type: semanticTrackTypes.track },
  tracks: {
    childSurface: "Track",
    sourceAttribute: "source",
    types: [compositionTypes.visualTrack, compositionTypes.audioTrack],
  },
}];
