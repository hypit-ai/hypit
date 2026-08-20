import type { ComponentPackage } from "@hypit/component-kit";
import { projectSemanticProgramSpace } from "@hypit/semantic-track";
import type { SemanticTrack } from "@hypit/semantic-track";
import type { CanvasSpace } from "@hypit/spatial";
import type { AudioTrack, VisualTrack } from "@hypit/composition";
import type { StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";

import { filmProducers } from "./manifest.js";
import { appendFilmAudioTrack, appendFilmVisualTrack, compileFilmComposition, createFilmTrackSet } from "./program.js";
import type { FilmProgram, FilmTrackSet } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const filmComponent = {
  producers: [
    {
      producer: filmProducers.createTrackSet,
      handler: () => ({
        outputs: { set: { kind: "inline", value: canonicalize(createFilmTrackSet()) } },
        needs: {},
      }),
    },
    {
      producer: filmProducers.appendVisualTrack,
      handler: ({ inputs }) => ({
        outputs: { set: { kind: "inline", value: canonicalize(appendFilmVisualTrack(
          inline<FilmTrackSet>(inputs.set?.value, "FilmTrackSet"),
          projectSemanticProgramSpace(inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack")),
          inline<VisualTrack>(inputs.track?.value, "VisualTrack"),
        )) } },
        needs: {},
      }),
    },
    {
      producer: filmProducers.appendAudioTrack,
      handler: ({ inputs }) => ({
        outputs: { set: { kind: "inline", value: canonicalize(appendFilmAudioTrack(
          inline<FilmTrackSet>(inputs.set?.value, "FilmTrackSet"),
          projectSemanticProgramSpace(inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack")),
          inline<AudioTrack>(inputs.track?.value, "AudioTrack"),
        )) } },
        needs: {},
      }),
    },
    {
      producer: filmProducers.compileComposition,
      handler: ({ inputs }) => ({
        outputs: { composition: { kind: "inline", value: canonicalize(compileFilmComposition(
          inline<FilmProgram>(inputs.program?.value, "FilmProgram"),
          inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace"),
          projectSemanticProgramSpace(inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack")),
          inline<FilmTrackSet>(inputs.set?.value, "FilmTrackSet"),
        )) } },
        needs: {},
      }),
    },
  ],
} satisfies ComponentPackage;
