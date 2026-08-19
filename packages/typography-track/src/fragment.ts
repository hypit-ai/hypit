import { programSpaceTypes } from "@hypit/program-space";
import { compositionTypes } from "@hypit/composition";
import type { VisualTrack } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";

import { typographyTrackProducers, typographyTrackTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Provider-free official lowering from TypographyTrackProgram to one peer VisualTrack. */
export const typographyTrackFragment = sealGraphFragment({
  inputs: [
    { name: "space", type: programSpaceTypes.programSpace },
    { name: "program", type: typographyTrackTypes.program },
  ],
  operations: [{
    id: "render",
    producer: typographyTrackProducers.render,
    inputs: { space: input("space"), program: input("program") },
    result: { kind: "output", name: "track" },
  }],
  exports: [{
    name: "track",
    type: compositionTypes.visualTrack,
    root: operation("render"),
  }],
});
