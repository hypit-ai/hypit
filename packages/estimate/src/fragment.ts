import { speechTypes } from "@narratage/speech";
import { sealGraphFragment } from "@narratage/elaborator";
import { textTypes } from "@narratage/text";

import { estimateProducers, estimateTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const speechEstimateFragment = sealGraphFragment({
  name: "@narratage/estimate/speech@1",
  inputs: [
    { name: "speech", type: textTypes.text },
    { name: "policy", type: estimateTypes.speechPolicy },
  ],
  operations: [{
    id: "estimate",
    producer: estimateProducers.speech,
    inputs: { speech: input("speech"), policy: input("policy") },
    result: { kind: "output", name: "duration" },
  }],
  exports: [{
    name: "duration",
    type: speechTypes.duration,
    root: operation("estimate"),
    semanticInputs: ["speech", "policy"],
    fidelity: "exact",
  }],
});
