import type { ComponentPackage } from "@narratage/component-kit";
import type { ProgramSpace } from "@narratage/program-space";
import type { AudioTrack, VisualTrack } from "@narratage/composition";
import type { StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

import { filmProducers } from "./manifest.js";
import {
  appendFilmAudioTrack,
  appendFilmAudioTrackImplementationDigest,
  appendFilmVisualTrack,
  appendFilmVisualTrackImplementationDigest,
  compileFilmComposition,
  compileFilmCompositionImplementationDigest,
  createFilmTrackSet,
  createFilmTrackSetImplementationDigest,
} from "./program.js";
import type { FilmProgram, FilmTrackSet } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const filmComponent = {
  name: "@narratage/film",
  producers: [
    {
      producer: filmProducers.createTrackSet,
      implementationDigest: createFilmTrackSetImplementationDigest,
      handler: () => ({
        outputs: { set: { kind: "inline", value: canonicalize(createFilmTrackSet()) } },
        needs: {},
      }),
    },
    {
      producer: filmProducers.appendVisualTrack,
      implementationDigest: appendFilmVisualTrackImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { set: { kind: "inline", value: canonicalize(appendFilmVisualTrack(
          inline<FilmTrackSet>(inputs.set?.value, "FilmTrackSet"),
          inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
          inline<VisualTrack>(inputs.track?.value, "VisualTrack"),
        )) } },
        needs: {},
      }),
    },
    {
      producer: filmProducers.appendAudioTrack,
      implementationDigest: appendFilmAudioTrackImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { set: { kind: "inline", value: canonicalize(appendFilmAudioTrack(
          inline<FilmTrackSet>(inputs.set?.value, "FilmTrackSet"),
          inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
          inline<AudioTrack>(inputs.track?.value, "AudioTrack"),
        )) } },
        needs: {},
      }),
    },
    {
      producer: filmProducers.compileComposition,
      implementationDigest: compileFilmCompositionImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { composition: { kind: "inline", value: canonicalize(compileFilmComposition(
          inline<FilmProgram>(inputs.program?.value, "FilmProgram"),
          inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
          inline<FilmTrackSet>(inputs.set?.value, "FilmTrackSet"),
        )) } },
        needs: {},
      }),
    },
  ],
} satisfies ComponentPackage;
