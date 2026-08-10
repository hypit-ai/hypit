import { programSpaceTypes } from "@narratage/program-space";
import { speechTypes } from "@narratage/speech";
import type { SpeechBasis } from "@narratage/speech";
import { compositionTypes } from "@narratage/composition";
import { sealGraphFragment } from "@narratage/elaborator";
import { spatialTypes } from "@narratage/spatial";

import { speechBasisProducers } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Project the independently demandable facts carried by one SpeechBasis. */
export const speechBasisProjectionFragment = sealGraphFragment({
  name: "@narratage/speech-basis/projections@1",
  inputs: [{ name: "basis", type: speechTypes.basis }, { name: "canvas", type: spatialTypes.canvas }],
  operations: [
    {
      id: "project-program-space",
      producer: speechBasisProducers.projectProgramSpace,
      inputs: { basis: input("basis") },
      result: { kind: "output", name: "programSpace" },
    },
    {
      id: "project-audio",
      producer: speechBasisProducers.projectAudio,
      inputs: { basis: input("basis") },
      result: { kind: "output", name: "audio" },
    },
    {
      id: "project-visual",
      producer: speechBasisProducers.projectVisual,
      inputs: { basis: input("basis"), canvas: input("canvas") },
      result: { kind: "output", name: "visual" },
    },
    {
      id: "project-audio-track",
      producer: speechBasisProducers.projectAudioTrack,
      inputs: { basis: input("basis") },
      result: { kind: "output", name: "track" },
    },
  ],
  exports: [
    {
      name: "programSpace",
      type: programSpaceTypes.programSpace,
      root: operation("project-program-space"),
      semanticInputs: ["basis"],
      fidelity: "exact",
    },
    {
      name: "audio",
      type: speechTypes.audioBasis,
      root: operation("project-audio"),
      semanticInputs: ["basis"],
      fidelity: "exact",
    },
    {
      name: "visual",
      type: compositionTypes.visualTrack,
      root: operation("project-visual"),
      semanticInputs: ["basis", "canvas"],
      fidelity: "exact",
    },
    {
      name: "audioTrack",
      type: compositionTypes.audioTrack,
      root: operation("project-audio-track"),
      semanticInputs: ["basis"],
      fidelity: "exact",
    },
  ],
});
