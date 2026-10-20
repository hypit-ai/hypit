import { canonicalize } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { Value } from "@hypit/hypit/protocol";
import type { AudioTrack, VisualTrack } from "@hypit/composition";
import type { Canvas } from "@hypit/spatial";
import type { Timeline } from "@hypit/timeline";

import { filmProducers } from "./manifest.js";
import { appendFilmAudioTrack, appendFilmVisualTrack, compileFilmComposition, createFilmTrackSet } from "./program.js";
import type { FilmProgram, FilmTrackSet } from "./types.js";

function valueOf<T>(value: Value | undefined, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value as unknown as T;
}

export const filmComponent = {
  producers: [
    {
      producer: filmProducers.createTrackSet,
      handler: () => ({ kind: "output", value: (canonicalize(createFilmTrackSet())) }),
    },
    {
      producer: filmProducers.appendVisualTrack,
      handler: ({ inputs }) => ({ kind: "output", value: (canonicalize(appendFilmVisualTrack(
          valueOf<FilmTrackSet>(inputs.set?.value, "FilmTrackSet"),
          valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
          valueOf<VisualTrack>(inputs.track?.value, "VisualTrack"),
        ))) }),
    },
    {
      producer: filmProducers.appendAudioTrack,
      handler: ({ inputs }) => ({ kind: "output", value: (canonicalize(appendFilmAudioTrack(
          valueOf<FilmTrackSet>(inputs.set?.value, "FilmTrackSet"),
          valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
          valueOf<AudioTrack>(inputs.track?.value, "AudioTrack"),
        ))) }),
    },
    {
      producer: filmProducers.compileComposition,
      handler: ({ inputs }) => ({ kind: "output", value: (canonicalize(compileFilmComposition(
          valueOf<FilmProgram>(inputs.program?.value, "FilmProgram"),
          valueOf<Canvas>(inputs.canvas?.value, "Canvas"),
          valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
          valueOf<FilmTrackSet>(inputs.set?.value, "FilmTrackSet"),
        ))) }),
    },
  ],
} satisfies ProducerPackage & RefinementPackage;
