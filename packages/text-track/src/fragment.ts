import { contractTypes } from "@svml/contracts";
import { sealGraphFragment } from "@svml/elaborator";

import { textTrackProducers, textTrackTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Provider-free official lowering from TextTrackProgram to one peer VisualTrack. */
export const textTrackFragment = sealGraphFragment({
  name: "@svml/text-track/render@1",
  inputs: [
    { name: "space", type: contractTypes.programSpace },
    { name: "program", type: textTrackTypes.program },
  ],
  operations: [{
    id: "render",
    producer: textTrackProducers.render,
    inputs: { space: input("space"), program: input("program") },
    result: { kind: "output", name: "track" },
  }],
  exports: [{
    name: "track",
    type: contractTypes.visualTrack,
    root: operation("render"),
    semanticInputs: ["space", "program"],
    affinity: [
      { resultPointer: "/programSpaceDigest", source: input("space"), sourcePointer: "/digest" },
      { resultPointer: "/sources/0/digest", source: input("program"), sourcePointer: "/digest" },
    ],
    fidelity: "exact",
  }],
});
