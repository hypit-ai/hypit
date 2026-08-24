import type { StudioAdapter } from "@hypit/studio-adapter";

import { audioAdapters } from "./audio.js";
import { deckAdapters } from "./deck.js";
import { genericAdapters } from "./generic.js";
import { mediaAdapters } from "./media.js";
import { rankingAdapters } from "./ranking.js";
import { speechAdapters } from "./speech.js";

/** Official video-domain interpretation, selected by the Studio distribution. */
export const videoStudioAdapters: readonly StudioAdapter[] = [
  ...rankingAdapters,
  ...deckAdapters,
  ...speechAdapters,
  ...mediaAdapters,
  ...audioAdapters,
  ...genericAdapters,
];

export { audioAdapters } from "./audio.js";
export { deckAdapters } from "./deck.js";
export { genericAdapters } from "./generic.js";
export { mediaAdapters } from "./media.js";
export { rankingAdapters } from "./ranking.js";
export { speechAdapters } from "./speech.js";
export { videoLaneHeights } from "./presentation.js";
