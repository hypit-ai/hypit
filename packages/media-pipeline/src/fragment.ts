import { artifactTypes } from "@svml/artifact";
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
    { name: "source", type: artifactTypes.blob },
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
    fidelity: "exact",
  }],
});
