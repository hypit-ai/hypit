import type { ComponentPackage } from "@narratage/component-kit";
import type { Narrative } from "@narratage/narrative";
import type { SpeechAudioBasis } from "@narratage/speech";
import type { AlignedTranscriptEvidence } from "@narratage/speech-evidence";
import type { StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

import {
  locateSpeechTiming,
} from "./locate.js";
import { speechAlignmentProducers } from "./manifest.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as T;
}

/** Provider-neutral deterministic alignment; acoustic measurement remains an explicit upstream Need. */
export const speechAlignmentComponent = {
  producers: [{
    producer: speechAlignmentProducers.locate,
    handler: ({ inputs }) => ({
      outputs: {
        map: {
          kind: "inline",
          value: canonicalize(locateSpeechTiming(
            inline<Narrative>(inputs.narrative?.value, "Narrative"),
            inline<SpeechAudioBasis>(inputs.audio?.value, "SpeechAudioBasis"),
            inline<AlignedTranscriptEvidence>(inputs.evidence?.value, "AlignedTranscriptEvidence"),
          )),
        },
      },
      needs: {},
    }),
  }],
} satisfies ComponentPackage;
