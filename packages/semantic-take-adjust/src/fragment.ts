import { sealGraphFragment } from "@hypit/elaborator";
import { speechTypes } from "@hypit/speech";

import { semanticTakeAdjustProducers, semanticTakeAdjustTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });

export const semanticTakeAdjustFragment = sealGraphFragment({
  inputs: [
    { name: "source", type: speechTypes.semanticTake },
    { name: "plan", type: semanticTakeAdjustTypes.plan },
  ],
  operations: [{
    id: "adjust",
    producer: semanticTakeAdjustProducers.adjust,
    inputs: { source: input("source"), plan: input("plan") },
    result: { kind: "output", name: "take" },
  }],
  exports: [{
    name: "take",
    type: speechTypes.semanticTake,
    root: { kind: "fragment-operation", operation: "adjust" },
  }],
});
