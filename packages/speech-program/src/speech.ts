import { captionProducers, captionTypes } from "@svml/caption";
import { contractTypes } from "@svml/contracts";
import { sealGraphFragment } from "@svml/elaborator";
import { speechTakeProducers } from "@svml/speech-take";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Project one atomic SpeechTake Product without turning its fields into mutable node ports. */
export const speechTakeProjectionFragment = sealGraphFragment({
  name: "@svml/speech-program/speech-take-projections@1",
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
      affinity: [{ resultPointer: "/digest", source: input("take"), sourcePointer: "/programSpace/digest" }],
      fidelity: "exact",
    },
    {
      name: "audio",
      type: contractTypes.speechAudioBasis,
      root: operation("project-audio"),
      semanticInputs: ["take"],
      affinity: [
        { resultPointer: "/programSpace/digest", source: input("take"), sourcePointer: "/programSpace/digest" },
        { resultPointer: "/audio/digest", source: input("take"), sourcePointer: "/audio/digest" },
      ],
      fidelity: "exact",
    },
    {
      name: "visual",
      type: contractTypes.visualTrack,
      root: operation("project-visual"),
      semanticInputs: ["take"],
      affinity: [
        { resultPointer: "/programSpaceDigest", source: input("take"), sourcePointer: "/programSpace/digest" },
      ],
      fidelity: "exact",
    },
    {
      name: "audioTrack",
      type: contractTypes.audioTrack,
      root: operation("project-audio-track"),
      semanticInputs: ["take"],
      affinity: [
        { resultPointer: "/programSpaceDigest", source: input("take"), sourcePointer: "/programSpace/digest" },
      ],
      fidelity: "exact",
    },
  ],
});

export const captionTimingFragment = sealGraphFragment({
  name: "@svml/speech-program/caption-timing@1",
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
    affinity: [
      { resultPointer: "/programSpace/digest", source: input("map"), sourcePointer: "/programSpace/digest" },
    ],
    fidelity: "exact",
  }],
});

/** Official caption lowering; the exported result is an ordinary peer VisualTrack. */
export const captionTrackFragment = sealGraphFragment({
  name: "@svml/speech-program/caption-track@1",
  inputs: [
    { name: "caption", type: captionTypes.timedProjection },
    { name: "program", type: captionTypes.trackProgram },
  ],
  operations: [{
    id: "render-caption-track",
    producer: captionProducers.renderTrack,
    inputs: { caption: input("caption"), program: input("program") },
    result: { kind: "output", name: "track" },
  }],
  exports: [{
    name: "track",
    type: contractTypes.visualTrack,
    root: operation("render-caption-track"),
    semanticInputs: ["caption", "program"],
    affinity: [
      { resultPointer: "/programSpaceDigest", source: input("caption"), sourcePointer: "/programSpace/digest" },
    ],
    fidelity: "exact",
  }],
});
