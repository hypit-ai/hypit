import type { ComponentPackage } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import type { StoredValue } from "@hypit/protocol";
import type { SemanticTake } from "@hypit/speech";

import { semanticTakeAdjustProducers } from "./manifest.js";
import { adjustSemanticTake } from "./program.js";
import type { SemanticTakeAdjustmentPlan } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline.`);
  return value.value as unknown as T;
}

export const semanticTakeAdjustComponent = {
  producers: [{
    producer: semanticTakeAdjustProducers.adjust,
    handler: ({ inputs }) => ({
      outputs: {
        take: {
          kind: "inline",
          value: canonicalize(adjustSemanticTake(
            inline<SemanticTake>(inputs.source?.value, "SemanticTake"),
            inline<SemanticTakeAdjustmentPlan>(inputs.plan?.value, "SemanticTake adjustment plan"),
          )),
        },
      },
      needs: {},
    }),
  }],
} satisfies ComponentPackage;
