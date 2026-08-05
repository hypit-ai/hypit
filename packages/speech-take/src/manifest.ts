import {
  contractTypes,
  videoContractDependencies,
} from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import type { ModuleManifest, ProducerRef } from "@svml/protocol";

import {
  projectSpeechAudioImplementationDigest,
  projectSpeechAudioTrackImplementationDigest,
  projectSpeechProgramSpaceImplementationDigest,
  projectSpeechVisualImplementationDigest,
} from "./projection.js";

export const speechTakeModuleRef = { name: "@svml/speech-take", version: "0.0.0-dev" } as const;

export const speechTakeProducers = {
  projectAudio: { module: speechTakeModuleRef, name: "project-audio" },
  projectAudioTrack: { module: speechTakeModuleRef, name: "project-audio-track" },
  projectVisual: { module: speechTakeModuleRef, name: "project-visual" },
  projectProgramSpace: { module: speechTakeModuleRef, name: "project-program-space" },
} satisfies Record<string, ProducerRef>;

export const speechTakeManifest: ModuleManifest = {
  format: "svml.module@0",
  name: speechTakeModuleRef.name,
  version: speechTakeModuleRef.version,
  dependencies: [
    videoContractDependencies.speech,
    videoContractDependencies.programSpace,
    videoContractDependencies.composition,
  ],
  types: [],
  capabilities: [],
  surfaces: [],
  producers: [
    {
      name: speechTakeProducers.projectProgramSpace.name,
      inputs: [{ name: "basis", type: contractTypes.speechBasis }],
      outputs: [{
        name: "programSpace",
        type: contractTypes.programSpace,
        affinity: [{ resultPointer: "/digest", input: "basis", inputPointer: "/programSpace/digest" }],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/speech-take/project-program-space",
        digest: projectSpeechProgramSpaceImplementationDigest,
      },
    },
    {
      name: speechTakeProducers.projectAudio.name,
      inputs: [{ name: "basis", type: contractTypes.speechBasis }],
      outputs: [{
        name: "audio",
        type: contractTypes.speechAudioBasis,
        affinity: [
          { resultPointer: "/basisDigest", input: "basis", inputPointer: "/basisDigest" },
          { resultPointer: "/narrativeDigest", input: "basis", inputPointer: "/narrativeDigest" },
          { resultPointer: "/programSpace/digest", input: "basis", inputPointer: "/programSpace/digest" },
          { resultPointer: "/audio/digest", input: "basis", inputPointer: "/audio/digest" },
        ],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/speech-take/project-audio",
        digest: projectSpeechAudioImplementationDigest,
      },
    },
    {
      name: speechTakeProducers.projectVisual.name,
      inputs: [{ name: "basis", type: contractTypes.speechBasis }],
      outputs: [{
        name: "visual",
        type: contractTypes.visualTrack,
        affinity: [
          { resultPointer: "/sources/0/digest", input: "basis", inputPointer: "/basisDigest" },
          { resultPointer: "/sources/1/digest", input: "basis", inputPointer: "/narrativeDigest" },
          { resultPointer: "/programSpaceDigest", input: "basis", inputPointer: "/programSpace/digest" },
        ],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/speech-take/project-visual",
        digest: projectSpeechVisualImplementationDigest,
      },
    },
    {
      name: speechTakeProducers.projectAudioTrack.name,
      inputs: [{ name: "basis", type: contractTypes.speechBasis }],
      outputs: [{
        name: "track",
        type: contractTypes.audioTrack,
        affinity: [
          { resultPointer: "/sources/0/digest", input: "basis", inputPointer: "/basisDigest" },
          { resultPointer: "/sources/1/digest", input: "basis", inputPointer: "/narrativeDigest" },
          { resultPointer: "/programSpaceDigest", input: "basis", inputPointer: "/programSpace/digest" },
        ],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/speech-take/project-audio-track",
        digest: projectSpeechAudioTrackImplementationDigest,
      },
    },
  ],
};

export const speechTakeManifestDigest = digestOf(speechTakeManifest);
