import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { speechDependency, speechTypes } from "@narratage/speech";
import { speechEvidenceDependency, speechEvidenceTypes } from "@narratage/speech-evidence";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
import type { ModuleManifest, ProducerRef } from "@narratage/protocol";

import { speechLocatorDigest } from "./locate.js";

export const speechAlignmentModuleRef = { name: "@narratage/speech-alignment", version: "0.0.0-dev" } as const;
export const speechAlignmentProducers = {
  locate: { module: speechAlignmentModuleRef, name: "locate-speech" },
} satisfies Record<string, ProducerRef>;

export const speechAlignmentManifest: ModuleManifest = {
  format: "svml.module@1",
  name: speechAlignmentModuleRef.name,
  version: speechAlignmentModuleRef.version,
  dependencies: [
    narrativeDependency,
    speechDependency,
    speechEvidenceDependency,
    semanticMapDependency,
  ],
  types: [],
  capabilities: [],
  surfaces: [],
  producers: [{
    name: speechAlignmentProducers.locate.name,
    inputs: [
      { name: "narrative", type: narrativeTypes.narrative },
      { name: "audio", type: speechTypes.audioBasis },
      { name: "evidence", type: speechEvidenceTypes.alignedTranscript },
    ],
    outputs: [{ name: "map", type: semanticMapTypes.complete }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "@narratage/speech-alignment/locate",
      digest: speechLocatorDigest,
    },
  }],
};
