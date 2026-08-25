import { estimateTypes } from "@hypit/estimate";
import { sealGraphFragment } from "@hypit/elaborator";
import { mediaTypes } from "@hypit/media";
import { narrativeTypes } from "@hypit/narrative";
import { speechTypes } from "@hypit/speech";

import { semanticTakeEstimateProducers } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const semanticTakeEstimateFragment = sealGraphFragment({
  inputs: [
    { name: "narrative", type: narrativeTypes.narrative },
    { name: "segment", type: narrativeTypes.excerpt },
    { name: "media", type: mediaTypes.synchronized },
    { name: "policy", type: estimateTypes.speechPolicy },
  ],
  operations: [{
    id: "materialize",
    producer: semanticTakeEstimateProducers.materialize,
    inputs: {
      narrative: input("narrative"),
      segment: input("segment"),
      media: input("media"),
      policy: input("policy"),
    },
    result: { kind: "output", name: "take" },
  }],
  exports: [{ name: "take", type: speechTypes.semanticTake, root: operation("materialize") }],
});
