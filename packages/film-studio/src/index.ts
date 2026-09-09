import { programSpaceTypes } from "@hypit/program-space";
import type { StudioFilmCompanion } from "@hypit/studio-adapter";
import { compositionTypes } from "@hypit/composition";
import { filmModuleRef } from "@hypit/film";
import { semanticTrackTypes } from "@hypit/semantic-track";

/** Film owns the author vocabulary that selects its time source and peer Tracks. */
export const filmStudioCompanions: readonly StudioFilmCompanion[] = [{
  id: "film",
  match: { module: filmModuleRef, surface: "film", outputType: compositionTypes.composition },
  timeSources: [{ attribute: "semantic", type: semanticTrackTypes.track }, { attribute: "space", type: programSpaceTypes.programSpace }],
  tracks: {
    childSurface: "Track",
    sourceAttribute: "source",
    types: [compositionTypes.visualTrack, compositionTypes.audioTrack],
  },
}];
