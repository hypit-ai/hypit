import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/hypit/author";
import { timelineTypes } from "@hypit/timeline";

import { htmlProgramProducers, htmlProgramTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/**
 * Compile one already assembled Composition into a HTML document.
 * Film is intentionally absent: any package capable of producing Composition
 * can use this ordinary downstream Fragment.
 */
export const htmlProgramFragment = sealGraphFragment({
  inputs: [
    { name: "composition", type: compositionTypes.composition },
    { name: "timeline", type: timelineTypes.timeline },
  ],
  operations: [{
    id: "compile-program",
    producer: htmlProgramProducers.compile,
    inputs: { composition: input("composition"), timeline: input("timeline") },
    result: { kind: "output" as const, name: "program" },
  }],
  exports: [{
    name: "program",
    type: htmlProgramTypes.program,
    root: operation("compile-program"),
  }],
});
