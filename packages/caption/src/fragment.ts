import { narrativeTypes } from "@narratage/narrative";
import { semanticMapTypes } from "@narratage/semantic-map";
import { sealGraphFragment } from "@narratage/elaborator";

import { captionProducers, captionTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const captionTimingFragment = sealGraphFragment({
  name: "@narratage/caption/timing@1",
  inputs: [
    { name: "narrative", type: narrativeTypes.narrative },
    { name: "map", type: semanticMapTypes.complete },
  ],
  operations: [{
    id: "temporalize-caption",
    producer: captionProducers.temporalize,
    inputs: { narrative: input("narrative"), map: input("map") },
    result: { kind: "output", name: "caption" },
  }],
  exports: [{
    name: "caption",
    type: captionTypes.timedProjection,
    root: operation("temporalize-caption"),
    semanticInputs: ["narrative", "map"],
    fidelity: "exact",
  }],
});

/** Cue and field facts meet measured speech time here, before any Style renderer. */
export const plannedCaptionTimingFragment = sealGraphFragment({
  name: "@narratage/caption/planned-timing@1",
  inputs: [
    { name: "narrative", type: narrativeTypes.narrative },
    { name: "map", type: semanticMapTypes.complete },
    { name: "words", type: narrativeTypes.captionWordSequence },
    { name: "plan", type: captionTypes.plan },
    { name: "program", type: captionTypes.program },
  ],
  operations: [{
    id: "temporalize-caption-plan",
    producer: captionProducers.temporalizePlan,
    inputs: {
      narrative: input("narrative"), map: input("map"), words: input("words"),
      plan: input("plan"), program: input("program"),
    },
    result: { kind: "output", name: "caption" },
  }],
  exports: [{
    name: "caption",
    type: captionTypes.timedProjection,
    root: operation("temporalize-caption-plan"),
    semanticInputs: ["narrative", "map", "words", "plan", "program"],
    fidelity: "exact",
  }],
});
