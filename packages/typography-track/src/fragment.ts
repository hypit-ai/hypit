import { programSpaceTypes } from "@narratage/program-space";
import { compositionTypes } from "@narratage/composition";
import type { VisualTrack } from "@narratage/composition";
import { sealGraphFragment } from "@narratage/elaborator";

import { typographyTrackProducers, typographyTrackTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Provider-free official lowering from TypographyTrackProgram to one peer VisualTrack. */
export const typographyTrackFragment = sealGraphFragment({
  name: "@narratage/typography-track/render@1",
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
