import type { ComponentPackage } from "@narratage/component-kit";
import type { NarrativeExcerpt } from "@narratage/narrative";
import type { SynchronizedMedia, TimelineAudio } from "@narratage/media";
import type { StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";
import type { ContentFit, SpatialFrame } from "@narratage/spatial";

import { speechSpineProducers } from "./manifest.js";
import {
  appendSpeechSpineAudioTake,
  appendSpeechSpineAudioTakeImplementationDigest,
  appendSpeechSpineVisualTake,
  appendSpeechSpineVisualTakeImplementationDigest,
  assembleSpeechBasis,
  assembleSpeechBasisImplementationDigest,
  compileSpeechSpineAudio,
  compileSpeechSpineAudioImplementationDigest,
  createSpeechSpineSet,
  createSpeechSpineSetImplementationDigest,
} from "./program.js";
import type { SpeechSpineProgram, SpeechSpineSet, SpeechSpineVisualSpec } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const speechSpineComponent = {
  name: "@narratage/speech-spine",
  producers: [
    {
      producer: speechSpineProducers.createSet,
      implementationDigest: createSpeechSpineSetImplementationDigest,
      handler: () => ({
        outputs: { set: { kind: "inline", value: canonicalize(createSpeechSpineSet()) } },
        needs: {},
      }),
    },
    {
      producer: speechSpineProducers.appendAudioTake,
      implementationDigest: appendSpeechSpineAudioTakeImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { set: { kind: "inline", value: canonicalize(appendSpeechSpineAudioTake(
          inline<SpeechSpineSet>(inputs.set?.value, "SpeechSpineSet"),
          inline<SpeechSpineProgram>(inputs.program?.value, "SpeechSpineProgram"),
          inline<SynchronizedMedia>(inputs.media?.value, "SynchronizedMedia"),
          inline<NarrativeExcerpt>(inputs.segment?.value, "NarrativeExcerpt"),
        )) } },
        needs: {},
      }),
    },
    {
      producer: speechSpineProducers.appendVisualTake,
      implementationDigest: appendSpeechSpineVisualTakeImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { set: { kind: "inline", value: canonicalize(appendSpeechSpineVisualTake(
          inline<SpeechSpineSet>(inputs.set?.value, "SpeechSpineSet"),
          inline<SpeechSpineProgram>(inputs.program?.value, "SpeechSpineProgram"),
          inline<SynchronizedMedia>(inputs.media?.value, "SynchronizedMedia"),
          inline<NarrativeExcerpt>(inputs.segment?.value, "NarrativeExcerpt"),
          inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
          inline<ContentFit>(inputs.fit?.value, "ContentFit"),
          inline<SpeechSpineVisualSpec>(inputs.visualSpec?.value, "SpeechSpineVisualSpec"),
        )) } },
        needs: {},
      }),
    },
    {
      producer: speechSpineProducers.compileAudio,
      implementationDigest: compileSpeechSpineAudioImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { plan: { kind: "inline", value: canonicalize(compileSpeechSpineAudio(
          inline<SpeechSpineProgram>(inputs.program?.value, "SpeechSpineProgram"),
          inline<SpeechSpineSet>(inputs.set?.value, "SpeechSpineSet"),
        )) } },
        needs: {},
      }),
    },
    {
      producer: speechSpineProducers.assembleBasis,
      implementationDigest: assembleSpeechBasisImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { basis: { kind: "inline", value: canonicalize(assembleSpeechBasis(
          inline<SpeechSpineProgram>(inputs.program?.value, "SpeechSpineProgram"),
          inline<SpeechSpineSet>(inputs.set?.value, "SpeechSpineSet"),
          inline<TimelineAudio>(inputs.audio?.value, "TimelineAudio"),
        )) } },
        needs: {},
      }),
    },
  ],
} satisfies ComponentPackage;
