import { captionProducers, captionTypes } from "@narratage/caption";
import { contractTypes } from "@narratage/video-contracts";
import { sealGraphFragment } from "@narratage/elaborator";
import { speechTakeProducers } from "@narratage/speech-take";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Project one atomic SpeechTake Product without turning its fields into mutable node ports. */
export const speechTakeProjectionFragment = sealGraphFragment({
  name: "@narratage/speech-program/speech-take-projections@1",
  inputs: [{ name: "take", type: contractTypes.speechBasis }],
  operations: [
    {
      id: "project-program-space",
      producer: speechTakeProducers.projectProgramSpace,
      inputs: { basis: input("take") },
      result: { kind: "output", name: "programSpace" },
    },
    {
      id: "project-audio",
      producer: speechTakeProducers.projectAudio,
      inputs: { basis: input("take") },
      result: { kind: "output", name: "audio" },
    },
    {
      id: "project-visual",
      producer: speechTakeProducers.projectVisual,
      inputs: { basis: input("take") },
      result: { kind: "output", name: "visual" },
    },
    {
      id: "project-audio-track",
      producer: speechTakeProducers.projectAudioTrack,
      inputs: { basis: input("take") },
      result: { kind: "output", name: "track" },
    },
  ],
  exports: [
    {
      name: "programSpace",
      type: contractTypes.programSpace,
      root: operation("project-program-space"),
      semanticInputs: ["take"],
      fidelity: "exact",
    },
    {
      name: "audio",
      type: contractTypes.speechAudioBasis,
      root: operation("project-audio"),
      semanticInputs: ["take"],
      fidelity: "exact",
    },
    {
      name: "visual",
      type: contractTypes.visualTrack,
      root: operation("project-visual"),
      semanticInputs: ["take"],
      fidelity: "exact",
    },
    {
      name: "audioTrack",
      type: contractTypes.audioTrack,
      root: operation("project-audio-track"),
      semanticInputs: ["take"],
      fidelity: "exact",
    },
  ],
});

export const captionTimingFragment = sealGraphFragment({
  name: "@narratage/speech-program/caption-timing@1",
  inputs: [
    { name: "narrative", type: contractTypes.narrative },
    { name: "map", type: contractTypes.completeSemanticMap },
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
  name: "@narratage/speech-program/caption-track@1",
  inputs: [
    { name: "caption", type: captionTypes.timedProjection },
    { name: "program", type: captionTypes.trackProgram },
    { name: "space", type: contractTypes.programSpace },
  ],
  operations: [{
    id: "render-caption-track",
    producer: captionProducers.renderTrack,
    inputs: { caption: input("caption"), program: input("program"), space: input("space") },
    result: { kind: "output", name: "track" },
  }],
  exports: [{
    name: "track",
    type: contractTypes.visualTrack,
    root: operation("render-caption-track"),
    semanticInputs: ["caption", "program", "space"],
    fidelity: "exact",
  }],
});
