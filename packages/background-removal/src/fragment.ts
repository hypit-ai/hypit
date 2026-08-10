import { artifactTypes } from "@narratage/artifact";
import { sealGraphFragment } from "@narratage/elaborator";

import { backgroundRemovalProducers } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const backgroundRemovalFragment = sealGraphFragment({
  name: "@narratage/background-removal/remove@1",
  inputs: [{ name: "source", type: artifactTypes.blob }],
  operations: [{
    id: "image:remove-background", producer: backgroundRemovalProducers.request,
    inputs: { source: input("source") }, result: { kind: "need", name: "image", accepts: "exact" },
  }],
  exports: [{
    name: "image", type: artifactTypes.blob, root: operation("image:remove-background"),
    semanticInputs: ["source"], fidelity: "exact",
  }],
});
