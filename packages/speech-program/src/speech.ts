import { captionProducers, captionTypes } from "@svml/caption";
import { contractTypes } from "@svml/contracts";
import { sealGraphFragment } from "@svml/elaborator";
import { speechAlignProducers } from "@svml/speech-align";
import { speechTakeProducers } from "@svml/speech-take";
import { whisperXProducers, whisperXTypes } from "@svml/whisperx";

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
        { resultPointer: "/basisDigest", source: input("take"), sourcePointer: "/basisDigest" },
        { resultPointer: "/narrativeDigest", source: input("take"), sourcePointer: "/narrativeDigest" },
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
        { resultPointer: "/sources/0/digest", source: input("take"), sourcePointer: "/basisDigest" },
        { resultPointer: "/sources/1/digest", source: input("take"), sourcePointer: "/narrativeDigest" },
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
        { resultPointer: "/sources/0/digest", source: input("take"), sourcePointer: "/basisDigest" },
        { resultPointer: "/sources/1/digest", source: input("take"), sourcePointer: "/narrativeDigest" },
        { resultPointer: "/programSpaceDigest", source: input("take"), sourcePointer: "/programSpace/digest" },
      ],
      fidelity: "exact",
    },
  ],
});

/** One WhisperX pass can expose both normalized Evidence and the final SemanticMap. */
export const whisperXSpeechAlignmentFragment = sealGraphFragment({
  name: "@svml/speech-program/whisperx-speech-alignment@1",
  inputs: [
    { name: "narrative", type: contractTypes.narrative },
    { name: "audio", type: contractTypes.speechAudioBasis },
  ],
  operations: [
    {
      id: "request-whisperx",
      producer: whisperXProducers.request,
      inputs: { audio: input("audio") },
      result: { kind: "need", name: "alignment", accepts: "exact" },
    },
    {
      id: "normalize-evidence",
      producer: whisperXProducers.normalize,
      inputs: { whisperx: operation("request-whisperx") },
      result: { kind: "output", name: "evidence" },
    },
    {
      id: "locate-speech",
      producer: speechAlignProducers.locate,
      inputs: {
        narrative: input("narrative"),
        audio: input("audio"),
        evidence: operation("normalize-evidence"),
      },
      result: { kind: "output", name: "map" },
    },
  ],
  exports: [
    {
      name: "rawEvidence",
      type: whisperXTypes.alignmentEvidence,
      root: operation("request-whisperx"),
      semanticInputs: ["audio"],
      affinity: [
        { resultPointer: "/basisDigest", source: input("audio"), sourcePointer: "/basisDigest" },
        { resultPointer: "/audioArtifactDigest", source: input("audio"), sourcePointer: "/audio/digest" },
        { resultPointer: "/programSpaceDigest", source: input("audio"), sourcePointer: "/programSpace/digest" },
      ],
      fidelity: "exact",
    },
    {
      name: "evidence",
      type: contractTypes.alignedTranscriptEvidence,
      root: operation("normalize-evidence"),
      semanticInputs: ["audio"],
      affinity: [
        { resultPointer: "/basisDigest", source: input("audio"), sourcePointer: "/basisDigest" },
        { resultPointer: "/audioArtifactDigest", source: input("audio"), sourcePointer: "/audio/digest" },
        { resultPointer: "/programSpaceDigest", source: input("audio"), sourcePointer: "/programSpace/digest" },
      ],
      fidelity: "exact",
    },
    {
      name: "map",
      type: contractTypes.completeSemanticMap,
      root: operation("locate-speech"),
      semanticInputs: ["narrative", "audio"],
      affinity: [
        { resultPointer: "/semanticIndexDigest", source: input("narrative"), sourcePointer: "/semanticIndex/digest" },
        { resultPointer: "/basisDigest", source: input("audio"), sourcePointer: "/basisDigest" },
        { resultPointer: "/audioArtifactDigest", source: input("audio"), sourcePointer: "/audio/digest" },
        { resultPointer: "/programSpaceDigest", source: input("audio"), sourcePointer: "/programSpace/digest" },
        { resultPointer: "/programSpace/digest", source: input("audio"), sourcePointer: "/programSpace/digest" },
        { resultPointer: "/evidenceDigest", source: operation("normalize-evidence"), sourcePointer: "/evidenceDigest" },
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
      { resultPointer: "/semanticIndexDigest", source: input("narrative"), sourcePointer: "/semanticIndex/digest" },
      { resultPointer: "/speechTimeMapDigest", source: input("map"), sourcePointer: "/mapDigest" },
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
      { resultPointer: "/sources/0/digest", source: input("program"), sourcePointer: "/digest" },
      { resultPointer: "/sources/1/digest", source: input("caption"), sourcePointer: "/projectionDigest" },
    ],
    fidelity: "exact",
  }],
});
