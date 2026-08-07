import { contractTypes } from "@narratage/contracts";
import { sealGraphFragment } from "@narratage/elaborator";

import { estimateProducers, estimateTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const speechEstimateFragment = sealGraphFragment({
  name: "@narratage/estimate/speech@1",
  inputs: [
    { name: "speech", type: contractTypes.narrativeSpeechExcerpt },
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
    type: contractTypes.speechDuration,
    root: operation("estimate"),
    semanticInputs: ["speech", "policy"],
    fidelity: "exact",
  }],
});
