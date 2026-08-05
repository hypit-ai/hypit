import { contractTypes } from "@svml/contracts";
import { sealGraphFragment } from "@svml/elaborator";
import { hyperframesProducers } from "@svml/hyperframes";

import {
  hyperframesRenderProducers,
  hyperframesRenderTypes,
} from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const hyperframesRenderFragment = sealGraphFragment({
  name: "@svml/hyperframes-render/video@1",
  inputs: [{ name: "composition", type: contractTypes.composition }],
  operations: [
    {
      id: "compile-document",
      producer: hyperframesProducers.compile,
      inputs: { composition: input("composition") },
      result: { kind: "output", name: "document" },
    },
    {
      id: "request-render",
      producer: hyperframesRenderProducers.request,
      inputs: { document: operation("compile-document") },
      result: { kind: "need", name: "product", accepts: "exact" },
    },
    {
      id: "project-video",
      producer: hyperframesRenderProducers.projectVideo,
      inputs: { product: operation("request-render") },
      result: { kind: "output", name: "video" },
    },
  ],
  exports: [{
    name: "video",
    type: contractTypes.mediaArtifact,
    root: operation("project-video"),
    semanticInputs: ["composition"],
    affinity: [{
      resultPointer: "/digest",
      source: operation("request-render"),
      sourcePointer: "/artifact/digest",
    }],
    fidelity: "exact",
  }],
});
