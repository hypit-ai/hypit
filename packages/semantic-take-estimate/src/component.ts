import type { ComponentPackage } from "@hypit/component-kit";
import type { SpeechEstimatePolicy } from "@hypit/estimate";
import type { SynchronizedMedia } from "@hypit/media";
import type { Narrative, NarrativeExcerpt } from "@hypit/narrative";
import { canonicalize } from "@hypit/protocol";
import type { StoredValue } from "@hypit/protocol";

import { semanticTakeEstimateProducers } from "./manifest.js";
import { materializeEstimatedSemanticTake } from "./program.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const semanticTakeEstimateComponent = {
  producers: [{
    producer: semanticTakeEstimateProducers.materialize,
    handler: ({ inputs }) => ({
      outputs: {
        take: {
          kind: "inline",
          value: canonicalize(materializeEstimatedSemanticTake(
            inline<Narrative>(inputs.narrative?.value, "Narrative"),
            inline<NarrativeExcerpt>(inputs.segment?.value, "NarrativeExcerpt"),
            inline<SynchronizedMedia>(inputs.media?.value, "SynchronizedMedia"),
            inline<SpeechEstimatePolicy>(inputs.policy?.value, "SpeechEstimatePolicy"),
          )),
        },
      },
      needs: {},
    }),
  }],
} satisfies ComponentPackage;
