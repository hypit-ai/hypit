import { contractTypes } from "@svml/contracts";
import { sealGraphFragment } from "@svml/elaborator";

import {
  mediaPipelineProducers,
  mediaPipelineTypes,
} from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const synchronizedMediaFragment = sealGraphFragment({
  name: "@svml/media-pipeline/synchronized-media@1",
  inputs: [
    { name: "source", type: contractTypes.blobArtifact },
    { name: "request", type: mediaPipelineTypes.selectionRequest },
  ],
  operations: [
    {
      id: "inspect",
      producer: mediaPipelineProducers.inspect,
      inputs: { source: input("source") },
      result: { kind: "need", name: "inspection", accepts: "exact" },
    },
    {
      id: "select",
      producer: mediaPipelineProducers.select,
      inputs: { inspection: operation("inspect"), request: input("request") },
      result: { kind: "output", name: "selection" },
    },
    {
      id: "normalize",
      producer: mediaPipelineProducers.normalize,
      inputs: {
        source: input("source"),
        inspection: operation("inspect"),
        selection: operation("select"),
        request: input("request"),
      },
      result: { kind: "need", name: "media", accepts: "exact" },
    },
  ],
  exports: [{
    name: "media",
    type: contractTypes.synchronizedMedia,
    root: operation("normalize"),
    semanticInputs: ["request", "source"],
    affinity: [
      { resultPointer: "/sourceArtifactDigest", source: input("source"), sourcePointer: "/digest" },
      { resultPointer: "/inspectionDigest", source: operation("inspect"), sourcePointer: "/inspectionDigest" },
      { resultPointer: "/selectionDigest", source: operation("select"), sourcePointer: "/selectionDigest" },
    ],
    fidelity: "exact",
  }],
});
