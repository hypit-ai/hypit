import { mediaDependency, mediaTypes } from "@hypit/media";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { speechDependency, speechTypes } from "@hypit/speech";
import { speechEvidenceDependency, speechEvidenceTypes } from "@hypit/speech-evidence";
import type { ModuleManifest, ProducerRef } from "@hypit/protocol";

export const speechAlignmentModuleRef = { name: "@hypit/speech-alignment", version: "1" } as const;
export const speechAlignmentProducers = {
  alignTake: { module: speechAlignmentModuleRef, name: "align-semantic-take" },
} satisfies Record<string, ProducerRef>;

export const speechAlignmentManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: speechAlignmentModuleRef.name,
  version: speechAlignmentModuleRef.version,
  dependencies: [
    mediaDependency,
    narrativeDependency,
    speechDependency,
    speechEvidenceDependency,
  ],
  types: [],
  capabilities: [],
  producers: [
    {
      name: speechAlignmentProducers.alignTake.name,
      inputs: [
        { name: "narrative", type: narrativeTypes.narrative },
        { name: "segment", type: narrativeTypes.excerpt },
        { name: "media", type: mediaTypes.synchronized },
        { name: "evidence", type: speechEvidenceTypes.alignedTranscript },
      ],
      outputs: [{ name: "take", type: speechTypes.semanticTake }],
      needs: [],
    },
  ],
};
