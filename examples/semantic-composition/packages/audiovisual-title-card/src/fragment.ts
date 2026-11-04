import { sealGraphFragment } from "@hypit/hypit/author";
import { audiovisualTypes } from "@hypit/audiovisual";

import { titleCardProducers, titleCardTypes } from "./manifest.js";

export const titleCardSourceFragment = sealGraphFragment({
  inputs: [{ name: "spec", type: titleCardTypes.spec }],
  operations: [{
    id: "source",
    producer: titleCardProducers.source,
    inputs: { spec: { kind: "fragment-input", name: "spec" } },
    result: { kind: "output", name: "source" },
  }],
  exports: [{
    name: "source",
    type: audiovisualTypes.programSource,
    root: { kind: "fragment-operation", operation: "source" },
  }],
});
