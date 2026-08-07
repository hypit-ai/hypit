import type { ComponentPackage } from "@svml/component-kit";
import type { NarrativeSpeechExcerpt } from "@svml/contracts";
import type { StoredValue } from "@svml/protocol";
import { canonicalize } from "@svml/protocol";

import { estimateProducers } from "./manifest.js";
import { estimateSpeechDuration, estimateSpeechImplementationDigest } from "./program.js";
import type { SpeechEstimatePolicy } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const estimateComponent = {
  name: "@svml/estimate",
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
