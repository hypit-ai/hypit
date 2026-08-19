import { programSpaceTypes } from "@hypit/program-space";
import { speechTypes } from "@hypit/speech";
import type { SpeechBasis } from "@hypit/speech";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";

import { speechBasisProducers } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Project the independently demandable facts carried by one SpeechBasis. */
export const speechBasisProjectionFragment = sealGraphFragment({
  inputs: [{ name: "basis", type: speechTypes.basis }],
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
      inputs: { basis: input("basis") },
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
    },
    {
      name: "audio",
      type: speechTypes.audioBasis,
      root: operation("project-audio"),
    },
    {
      name: "visual",
      type: compositionTypes.visualTrack,
      root: operation("project-visual"),
    },
    {
      name: "audioTrack",
      type: compositionTypes.audioTrack,
      root: operation("project-audio-track"),
    },
  ],
});
