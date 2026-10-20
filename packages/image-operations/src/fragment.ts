import { blobTypes } from "@hypit/hypit/blob";
import { sealGraphFragment } from "@hypit/hypit/author";

import { imageTransformProducers, imageTransformTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const imageTransformFragment = sealGraphFragment({
  inputs: [
    { name: "source", type: blobTypes.blob },
    { name: "program", type: imageTransformTypes.program },
  ],
  operations: [{
    id: "image:transform",
    producer: imageTransformProducers.request,
    inputs: { source: input("source"), program: input("program") },
    result: { kind: "need" as const, name: "image" },
  }],
  exports: [{
    name: "image",
    type: blobTypes.blob,
    root: operation("image:transform"),
  }],
});
