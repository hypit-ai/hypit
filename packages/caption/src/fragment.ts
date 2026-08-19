import { narrativeTypes } from "@hypit/narrative";
import { semanticMapTypes } from "@hypit/semantic-map";
import { sealGraphFragment } from "@hypit/elaborator";

import { captionProducers, captionTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Cue and field facts meet only proven whole-Atom speech time here. */
export const plannedCaptionTimingFragment = sealGraphFragment({
  inputs: [
    { name: "display", type: narrativeTypes.captionDisplay },
    { name: "correspondence", type: narrativeTypes.captionCorrespondence },
    { name: "map", type: semanticMapTypes.complete },
    { name: "plan", type: captionTypes.plan },
    { name: "program", type: captionTypes.program },
  ],
  operations: [{
    id: "temporalize-caption-plan",
    producer: captionProducers.temporalizePlan,
    inputs: {
      display: input("display"), correspondence: input("correspondence"), map: input("map"),
      plan: input("plan"), program: input("program"),
    },
    result: { kind: "output", name: "caption" },
  }],
  exports: [{
    name: "caption",
    type: captionTypes.timedProjection,
    root: operation("temporalize-caption-plan"),
  }],
});
