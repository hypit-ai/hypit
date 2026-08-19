import type { ComponentPackage } from "@hypit/component-kit";
import type { StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";
import type { Text } from "@hypit/text";

import { estimateProducers } from "./manifest.js";
import { estimateSpeechDuration } from "./program.js";
import type { SpeechEstimatePolicy } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const estimateComponent = {
  producers: [{
    producer: estimateProducers.speech,
    handler: ({ inputs }) => ({
      outputs: {
        duration: {
          kind: "inline",
          value: canonicalize(estimateSpeechDuration(
            inline<Text>(inputs.speech?.value, "Speech Text"),
            inline<SpeechEstimatePolicy>(inputs.policy?.value, "SpeechEstimatePolicy"),
          )),
        },
      },
      needs: {},
    }),
  }],
} satisfies ComponentPackage;
