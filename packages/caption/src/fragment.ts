import { narrativeTypes } from "@narratage/narrative";
import { programSpaceTypes } from "@narratage/program-space";
import { semanticMapTypes } from "@narratage/semantic-map";
import { compositionTypes } from "@narratage/composition";
import type { VisualTrack } from "@narratage/composition";
import { sealGraphFragment } from "@narratage/elaborator";

import { captionProducers, captionTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Provider-free Caption base: authored display text + measured map -> peer VisualTrack. */
export const captionTrackSurfaceFragment = sealGraphFragment({
  name: "@narratage/caption/track-surface@1",
  inputs: [
    { name: "narrative", type: narrativeTypes.narrative },
    { name: "map", type: semanticMapTypes.complete },
    { name: "program", type: captionTypes.trackProgram },
    { name: "space", type: programSpaceTypes.programSpace },
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
    type: compositionTypes.visualTrack,
    root: operation("caption:render"),
    semanticInputs: ["narrative", "map", "program", "space"],
    fidelity: "exact",
  }],
});

/** Planner-neutral Cue/field facts join the independent measured map only at Caption lowering. */
export const plannedCaptionTrackSurfaceFragment = sealGraphFragment({
  name: "@narratage/caption/planned-track-surface@2",
  inputs: [
    { name: "narrative", type: narrativeTypes.narrative },
    { name: "map", type: semanticMapTypes.complete },
    { name: "plan", type: captionTypes.plan },
    { name: "program", type: captionTypes.program },
    { name: "space", type: programSpaceTypes.programSpace },
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
    type: compositionTypes.visualTrack,
    root: operation("caption:render-plan"),
    semanticInputs: ["narrative", "map", "plan", "program", "space"],
    fidelity: "exact",
  }],
});

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

/** Official caption lowering; the exported result is an ordinary peer VisualTrack. */
export const captionTrackFragment = sealGraphFragment({
  name: "@narratage/caption/track@1",
  inputs: [
    { name: "caption", type: captionTypes.timedProjection },
    { name: "program", type: captionTypes.trackProgram },
    { name: "space", type: programSpaceTypes.programSpace },
  ],
  operations: [{
    id: "render-caption-track",
    producer: captionProducers.renderTrack,
    inputs: { caption: input("caption"), program: input("program"), space: input("space") },
    result: { kind: "output", name: "track" },
  }],
  exports: [{
    name: "track",
    type: compositionTypes.visualTrack,
    root: operation("render-caption-track"),
    semanticInputs: ["caption", "program", "space"],
    fidelity: "exact",
  }],
});
