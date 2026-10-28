import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { narrativeTemporalDependency, narrativeTemporalTypes } from "@hypit/narrative-temporal";
import { speechEvidenceDependency, speechEvidenceTypes } from "@hypit/speech-evidence";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import type { ModuleManifest, ProducerRef } from "@hypit/hypit/protocol";

export const speechAlignmentModuleRef = { name: "@hypit/narrative-speech-alignment", version: "1" } as const;
export const speechAlignmentProducers = {
  alignNarrative: { module: speechAlignmentModuleRef, name: "align-narrative" },
} satisfies Record<string, ProducerRef>;

export const speechAlignmentManifest: ModuleManifest = {
  format: "hypit.module@1", name: speechAlignmentModuleRef.name, version: speechAlignmentModuleRef.version,
  dependencies: [narrativeDependency, narrativeTemporalDependency, speechEvidenceDependency, temporalDependency],
  types: [], capabilities: [], producers: [{
    name: speechAlignmentProducers.alignNarrative.name,
    inputs: [{ name: "narrative", type: narrativeTypes.narrative }, { name: "segment", type: narrativeTypes.segmentRef },
      { name: "domain", type: temporalTypes.localDomain },
      { name: "evidence", type: speechEvidenceTypes.transcript }],
    result: { kind: "output" as const, name: "alignment", type: narrativeTemporalTypes.narrativeAlignment },
  }],
};
export const speechAlignmentDependency = speechAlignmentModuleRef;
