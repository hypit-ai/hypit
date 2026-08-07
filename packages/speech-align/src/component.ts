import type { ComponentPackage } from "@narratage/component-kit";
import type {
  AlignedTranscriptEvidence,
  Narrative,
  SpeechAudioBasis,
} from "@narratage/contracts";
import type { StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

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
  name: "@narratage/speech-align",
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
