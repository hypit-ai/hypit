import {
  contractTypes,
  contractsManifestDigest,
  contractsModuleRef,
} from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import type { ModuleManifest, ProducerRef } from "@svml/protocol";

import {
  projectSpeechAudioImplementationDigest,
  projectSpeechVisualImplementationDigest,
} from "./projection.js";

export const speechTakeModuleRef = { name: "@svml/speech-take", version: "0.0.0-dev" } as const;

export const speechTakeProducers = {
  projectAudio: { module: speechTakeModuleRef, name: "project-audio" },
  projectVisual: { module: speechTakeModuleRef, name: "project-visual" },
} satisfies Record<string, ProducerRef>;

export const speechTakeManifest: ModuleManifest = {
  format: "svml.module@0",
  name: speechTakeModuleRef.name,
  version: speechTakeModuleRef.version,
  dependencies: [{ module: contractsModuleRef, digest: contractsManifestDigest }],
  types: [],
  capabilities: [],
  surfaces: [],
  producers: [
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
        type: contractTypes.speechVisualTrack,
        affinity: [
          { resultPointer: "/basisDigest", input: "basis", inputPointer: "/basisDigest" },
          { resultPointer: "/narrativeDigest", input: "basis", inputPointer: "/narrativeDigest" },
          { resultPointer: "/programSpace/digest", input: "basis", inputPointer: "/programSpace/digest" },
        ],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/speech-take/project-visual",
        digest: projectSpeechVisualImplementationDigest,
      },
    },
  ],
};

export const speechTakeManifestDigest = digestOf(speechTakeManifest);
