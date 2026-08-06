import type { ComponentPackage } from "@svml/component-kit";
import type {
  NarrativeExcerpt,
  SynchronizedMedia,
  TimelineAudio,
} from "@svml/contracts";
import type { StoredValue } from "@svml/protocol";
import { canonicalize } from "@svml/protocol";

import { speechProgramProducers } from "./manifest.js";
import {
  appendSpeechSpineTake,
  appendSpeechSpineTakeImplementationDigest,
  assembleSpeechBasis,
  assembleSpeechBasisImplementationDigest,
  compileSpeechSpineAudio,
  compileSpeechSpineAudioImplementationDigest,
  createSpeechSpineSet,
  createSpeechSpineSetImplementationDigest,
} from "./program.js";
import type { SpeechSpineProgram, SpeechSpineSet } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const speechProgramComponent = {
  name: "@svml/speech-program",
  producers: [
    {
      producer: speechProgramProducers.createSet,
      implementationDigest: createSpeechSpineSetImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { set: { kind: "inline", value: canonicalize(createSpeechSpineSet(inline<SpeechSpineProgram>(inputs.program?.value, "SpeechSpineProgram"))) } },
        needs: {},
      }),
    },
    {
      producer: speechProgramProducers.appendTake,
      implementationDigest: appendSpeechSpineTakeImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { set: { kind: "inline", value: canonicalize(appendSpeechSpineTake(
          inline<SpeechSpineSet>(inputs.set?.value, "SpeechSpineSet"),
          inline<SynchronizedMedia>(inputs.media?.value, "SynchronizedMedia"),
          inline<NarrativeExcerpt>(inputs.segment?.value, "NarrativeExcerpt"),
        )) } },
        needs: {},
      }),
    },
    {
      producer: speechProgramProducers.compileAudio,
      implementationDigest: compileSpeechSpineAudioImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { plan: { kind: "inline", value: canonicalize(compileSpeechSpineAudio(inline<SpeechSpineSet>(inputs.set?.value, "SpeechSpineSet"))) } },
        needs: {},
      }),
    },
    {
      producer: speechProgramProducers.assembleBasis,
      implementationDigest: assembleSpeechBasisImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: { basis: { kind: "inline", value: canonicalize(assembleSpeechBasis(
          inline<SpeechSpineSet>(inputs.set?.value, "SpeechSpineSet"),
          inline<TimelineAudio>(inputs.audio?.value, "TimelineAudio"),
        )) } },
        needs: {},
      }),
    },
  ],
} satisfies ComponentPackage;
