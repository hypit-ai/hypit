import type { ComponentPackage } from "@narratage/component-kit";
import type { NarrativeSpeechExcerpt } from "@narratage/video-contracts";
import type { StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

import { estimateProducers } from "./manifest.js";
import { estimateSpeechDuration, estimateSpeechImplementationDigest } from "./program.js";
import type { SpeechEstimatePolicy } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const estimateComponent = {
  name: "@narratage/estimate",
  producers: [{
    producer: estimateProducers.speech,
    implementationDigest: estimateSpeechImplementationDigest,
    handler: ({ inputs }) => ({
      outputs: {
        duration: {
          kind: "inline",
          value: canonicalize(estimateSpeechDuration(
            inline<NarrativeSpeechExcerpt>(inputs.speech?.value, "NarrativeSpeechExcerpt"),
            inline<SpeechEstimatePolicy>(inputs.policy?.value, "SpeechEstimatePolicy"),
          )),
        },
      },
      needs: {},
    }),
  }],
} satisfies ComponentPackage;
