import {
  contractTypes,
  videoContractDependencies,
} from "@svml/contracts";
import type { ModuleManifest, ProducerRef } from "@svml/protocol";

import { speechLocatorDigest } from "./locate.js";

export const speechAlignModuleRef = { name: "@svml/speech-align", version: "0.0.0-dev" } as const;
export const speechAlignProducers = {
  locate: { module: speechAlignModuleRef, name: "locate-speech" },
} satisfies Record<string, ProducerRef>;

export const speechAlignManifest: ModuleManifest = {
  format: "svml.module@0",
  name: speechAlignModuleRef.name,
  version: speechAlignModuleRef.version,
  dependencies: [
    videoContractDependencies.narrative,
    videoContractDependencies.speech,
    videoContractDependencies.semanticTime,
  ],
  types: [],
  capabilities: [],
  surfaces: [],
  producers: [{
    name: speechAlignProducers.locate.name,
    inputs: [
      { name: "narrative", type: contractTypes.narrative },
      { name: "audio", type: contractTypes.speechAudioBasis },
      { name: "evidence", type: contractTypes.alignedTranscriptEvidence },
    ],
    outputs: [{ name: "map", type: contractTypes.completeSemanticMap }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "@svml/speech-align/locate",
      digest: speechLocatorDigest,
    },
  }],
};
