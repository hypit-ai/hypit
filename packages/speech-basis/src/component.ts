import type { ComponentPackage } from "@narratage/component-kit";
import type { SpeechBasis } from "@narratage/speech";
import type { StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

import {
  speechBasisProducers,
} from "./manifest.js";
import {
  projectSpeechAudio,
  projectSpeechAudioImplementationDigest,
  projectSpeechAudioTrack,
  projectSpeechAudioTrackImplementationDigest,
  projectSpeechProgramSpace,
  projectSpeechProgramSpaceImplementationDigest,
  projectSpeechVisual,
  projectSpeechVisualImplementationDigest,
} from "./projection.js";

function speechBasis(value: StoredValue | undefined): SpeechBasis {
  if (value?.kind !== "inline") throw new Error("SpeechBasis must be inline");
  return value.value as unknown as SpeechBasis;
}

/** Pure projections of one atomic SpeechBasis; no Artifact read or external capability is hidden here. */
export const speechBasisComponent = {
  producers: [
    {
      producer: speechBasisProducers.projectProgramSpace,
      implementationDigest: projectSpeechProgramSpaceImplementationDigest,
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
      implementationDigest: projectSpeechAudioImplementationDigest,
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
      implementationDigest: projectSpeechVisualImplementationDigest,
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
      implementationDigest: projectSpeechAudioTrackImplementationDigest,
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
