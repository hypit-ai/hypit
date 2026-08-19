import type { ComponentPackage } from "@hypit/component-kit";
import type { SpeechBasis } from "@hypit/speech";
import type { StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";

import {
  speechBasisProducers,
} from "./manifest.js";
import { projectSpeechAudio, projectSpeechAudioTrack, projectSpeechProgramSpace, projectSpeechVisual } from "./projection.js";

function speechBasis(value: StoredValue | undefined): SpeechBasis {
  if (value?.kind !== "inline") throw new Error("SpeechBasis must be inline");
  return value.value as unknown as SpeechBasis;
}

/** Pure projections of one atomic SpeechBasis; no Artifact read or external capability is hidden here. */
export const speechBasisComponent = {
  producers: [
    {
      producer: speechBasisProducers.projectProgramSpace,
      handler: ({ inputs }) => ({
        outputs: {
          programSpace: {
            kind: "inline",
            value: canonicalize(projectSpeechProgramSpace(speechBasis(inputs.basis?.value))),
          },
        },
        needs: {},
      }),
    },
    {
      producer: speechBasisProducers.projectAudio,
      handler: ({ inputs }) => ({
        outputs: {
          audio: {
            kind: "inline",
            value: canonicalize(projectSpeechAudio(speechBasis(inputs.basis?.value))),
          },
        },
        needs: {},
      }),
    },
    {
      producer: speechBasisProducers.projectVisual,
      handler: ({ inputs }) => ({
        outputs: {
          visual: {
            kind: "inline",
            value: canonicalize(projectSpeechVisual(speechBasis(inputs.basis?.value))),
          },
        },
        needs: {},
      }),
    },
    {
      producer: speechBasisProducers.projectAudioTrack,
      handler: ({ inputs }) => ({
        outputs: {
          track: {
            kind: "inline",
            value: canonicalize(projectSpeechAudioTrack(speechBasis(inputs.basis?.value))),
          },
        },
        needs: {},
      }),
    },
  ],
} satisfies ComponentPackage;
