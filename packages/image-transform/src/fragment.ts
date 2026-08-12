import { artifactTypes } from "@narratage/artifact";
import { sealGraphFragment } from "@narratage/elaborator";

import { imageTransformProducers, imageTransformTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const imageTransformFragment = sealGraphFragment({
  name: "@narratage/image-transform/transform@1",
  inputs: [
    { name: "source", type: artifactTypes.blob },
    { name: "program", type: imageTransformTypes.program },
  ],
  operations: [{
    id: "image:transform",
    producer: imageTransformProducers.request,
    inputs: { source: input("source"), program: input("program") },
    result: { kind: "need", name: "image" },
  }],
  exports: [{
    name: "image",
    type: artifactTypes.blob,
    root: operation("image:transform"),
  }],
});
