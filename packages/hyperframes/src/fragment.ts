import { programSpaceTypes } from "@hypit/program-space";
import { compositionTypes } from "@hypit/composition";
import type { Composition } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";

import { hyperframesProducers, hyperframesTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/**
 * Compile one already assembled Composition into a Hyperframes document.
 * Film is intentionally absent: any package capable of producing Composition
 * can use this ordinary downstream Fragment.
 */
export const hyperframesDocumentFragment = sealGraphFragment({
  inputs: [
    { name: "composition", type: compositionTypes.composition },
    { name: "space", type: programSpaceTypes.programSpace },
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
  }],
});
