import type { ComponentPackage } from "@hypit/component-kit";
import type { NarrativeExcerpt } from "@hypit/narrative";
import type { SynchronizedMedia, TimelineAudio } from "@hypit/media";
import type { StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";
import type { ContentFit, SpatialFrame } from "@hypit/spatial";

import { speechSpineProducers } from "./manifest.js";
import { appendSpeechSpineAudioTake, appendSpeechSpineVisualTake, assembleSpeechBasis, compileSpeechSpineAudio, createSpeechSpineSet } from "./program.js";
import type { SpeechSpineProgram, SpeechSpineSet, SpeechSpineVisualSpec } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const speechSpineComponent = {
  producers: [
    {
      producer: speechSpineProducers.createSet,
      handler: () => ({
        outputs: { set: { kind: "inline", value: canonicalize(createSpeechSpineSet()) } },
        needs: {},
      }),
    },
    {
      producer: speechSpineProducers.appendAudioTake,
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
