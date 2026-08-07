import { contractTypes } from "@narratage/video-contracts";
import { sealGraphFragment } from "@narratage/elaborator";

import { hyperframesProducers, hyperframesTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/**
 * Compile one already assembled Composition into a Hyperframes document.
 * Film is intentionally absent: any package capable of producing Composition
 * can use this ordinary downstream Fragment.
 */
export const hyperframesDocumentFragment = sealGraphFragment({
  name: "@narratage/hyperframes/document@1",
  inputs: [
    { name: "composition", type: contractTypes.composition },
    { name: "space", type: contractTypes.programSpace },
  ],
  operations: [{
    id: "compile-document",
    producer: hyperframesProducers.compile,
    inputs: { composition: input("composition"), space: input("space") },
    result: { kind: "output", name: "document" },
  }],
  exports: [{
    name: "document",
    type: hyperframesTypes.document,
    root: operation("compile-document"),
    semanticInputs: ["composition", "space"],
    fidelity: "exact",
  }],
});
