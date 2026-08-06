import type { ComponentPackage } from "@svml/component-kit";
import type {
  AlignedTranscriptEvidence,
  Narrative,
  SpeechAudioBasis,
} from "@svml/contracts";
import type { StoredValue } from "@svml/protocol";
import { canonicalize } from "@svml/protocol";

import {
  locateSpeechTiming,
  speechLocatorDigest,
} from "./locate.js";
import { speechAlignProducers } from "./manifest.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as T;
}

/** Provider-neutral deterministic alignment; acoustic measurement remains an explicit upstream Need. */
export const speechAlignComponent = {
  name: "@svml/speech-align",
  producers: [{
    producer: speechAlignProducers.locate,
    implementationDigest: speechLocatorDigest,
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
