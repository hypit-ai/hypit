import { sealGraphFragment } from "@hypit/hypit/author";
import { narrativeTypes } from "@hypit/narrative";
import { narrativeTemporalProducers, narrativeTemporalTypes } from "@hypit/narrative-temporal";
import { speechEvidenceTypes } from "@hypit/speech-evidence";
import { temporalTypes } from "@hypit/temporal";

import { speechAlignmentProducers } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const speechAlignmentFragment = sealGraphFragment({
  inputs: [
    { name: "narrative", type: narrativeTypes.narrative },
    { name: "segment", type: narrativeTypes.segmentRef },
    { name: "domain", type: temporalTypes.localDomain },
    { name: "evidence", type: speechEvidenceTypes.transcript },
  ],
  operations: [{
    id: "align-narrative",
    producer: speechAlignmentProducers.alignNarrative,
    inputs: {
      narrative: input("narrative"),
      segment: input("segment"),
      domain: input("domain"),
      evidence: input("evidence"),
    },
    result: { kind: "output" as const, name: "alignment" },
  }],
  exports: [{ name: "alignment", type: narrativeTemporalTypes.narrativeAlignment, root: operation("align-narrative") }],
});

export const speechBoundaryAlignmentFragment = sealGraphFragment({
  inputs: [
    { name: "narrative", type: narrativeTypes.narrative },
    { name: "segment", type: narrativeTypes.segmentRef },
    { name: "domain", type: temporalTypes.localDomain },
  ],
  operations: [{
    id: "materialize-boundaries",
    producer: narrativeTemporalProducers.materializeSegmentBoundaries,
    inputs: { narrative: input("narrative"), segment: input("segment"), domain: input("domain") },
    result: { kind: "output" as const, name: "alignment" },
  }],
  exports: [{ name: "alignment", type: narrativeTemporalTypes.narrativeAlignment,
    root: operation("materialize-boundaries") }],
});
