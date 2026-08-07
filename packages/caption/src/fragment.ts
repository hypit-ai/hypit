import { contractTypes } from "@svml/contracts";
import { sealGraphFragment } from "@svml/elaborator";

import { captionProducers, captionTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Provider-free Caption base: authored display text + measured map -> peer VisualTrack. */
export const captionTrackSurfaceFragment = sealGraphFragment({
  name: "@svml/caption/track-surface@1",
  inputs: [
    { name: "narrative", type: contractTypes.narrative },
    { name: "map", type: contractTypes.completeSemanticMap },
    { name: "program", type: captionTypes.trackProgram },
    { name: "space", type: contractTypes.programSpace },
  ],
  operations: [
    {
      id: "caption:temporalize",
      producer: captionProducers.temporalize,
      inputs: { narrative: input("narrative"), map: input("map") },
      result: { kind: "output", name: "caption" },
    },
    {
      id: "caption:render",
      producer: captionProducers.renderTrack,
      inputs: { caption: operation("caption:temporalize"), program: input("program"), space: input("space") },
      result: { kind: "output", name: "track" },
    },
  ],
  exports: [{
    name: "track",
    type: contractTypes.visualTrack,
    root: operation("caption:render"),
    semanticInputs: ["narrative", "map", "program", "space"],
    fidelity: "exact",
  }],
});

/** Planner-neutral Cue/field facts join the independent measured map only at Caption lowering. */
export const plannedCaptionTrackSurfaceFragment = sealGraphFragment({
  name: "@svml/caption/planned-track-surface@2",
  inputs: [
    { name: "narrative", type: contractTypes.narrative },
    { name: "map", type: contractTypes.completeSemanticMap },
    { name: "plan", type: captionTypes.plan },
    { name: "program", type: captionTypes.program },
    { name: "space", type: contractTypes.programSpace },
  ],
  operations: [
    {
      id: "caption:temporalize-plan",
      producer: captionProducers.temporalizePlan,
      inputs: { narrative: input("narrative"), map: input("map"), program: input("program"), plan: input("plan") },
      result: { kind: "output", name: "caption" },
    },
    {
      id: "caption:render-plan",
      producer: captionProducers.renderProgram,
      inputs: { caption: operation("caption:temporalize-plan"), program: input("program"), space: input("space") },
      result: { kind: "output", name: "track" },
    },
  ],
  exports: [{
    name: "track",
    type: contractTypes.visualTrack,
    root: operation("caption:render-plan"),
    semanticInputs: ["narrative", "map", "plan", "program", "space"],
    fidelity: "exact",
  }],
});
