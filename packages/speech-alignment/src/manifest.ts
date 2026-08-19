import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { speechDependency, speechTypes } from "@hypit/speech";
import { speechEvidenceDependency, speechEvidenceTypes } from "@hypit/speech-evidence";
import { semanticMapDependency, semanticMapTypes } from "@hypit/semantic-map";
import type { ModuleManifest, ProducerRef } from "@hypit/protocol";

export const speechAlignmentModuleRef = { name: "@hypit/speech-alignment", version: "1" } as const;
export const speechAlignmentProducers = {
  locate: { module: speechAlignmentModuleRef, name: "locate-speech" },
} satisfies Record<string, ProducerRef>;

export const speechAlignmentManifest: ModuleManifest = {
  format: "hypit.module@1",
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
  producers: [{
    name: speechAlignmentProducers.locate.name,
    inputs: [
      { name: "narrative", type: narrativeTypes.narrative },
      { name: "audio", type: speechTypes.audioBasis },
      { name: "evidence", type: speechEvidenceTypes.alignedTranscript },
    ],
    outputs: [{ name: "map", type: semanticMapTypes.complete }],
    needs: [],
  }],
};
