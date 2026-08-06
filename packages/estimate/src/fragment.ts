import { contractTypes } from "@svml/contracts";
import { sealGraphFragment } from "@svml/elaborator";

import { estimateProducers, estimateTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const speechEstimateFragment = sealGraphFragment({
  name: "@svml/estimate/speech@1",
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
    affinity: [
      { resultPointer: "/sourceSpeechExcerptDigest", source: input("speech"), sourcePointer: "/excerptDigest" },
      { resultPointer: "/segmentId", source: input("speech"), sourcePointer: "/id" },
      { resultPointer: "/tokenStart", source: input("speech"), sourcePointer: "/tokenStart" },
      { resultPointer: "/tokenEndExclusive", source: input("speech"), sourcePointer: "/tokenEndExclusive" },
    ],
    fidelity: "exact",
  }],
});
