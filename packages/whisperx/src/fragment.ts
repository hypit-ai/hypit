import { narrativeTypes } from "@hypit/narrative";
import { narrativeTemporalProducers, narrativeTemporalTypes } from "@hypit/narrative-temporal";
import { mediaTypes } from "@hypit/media";
import { sealGraphFragment } from "@hypit/hypit/author";
import { speechEvidenceProducers } from "@hypit/speech-evidence";
import { speechAlignmentProducers } from "@hypit/narrative-speech-alignment";
import { temporalTypes } from "@hypit/temporal";

import { whisperXProducers, whisperXTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const whisperXAlignmentFragment = sealGraphFragment({
  inputs: [{ name: "narrative", type: narrativeTypes.narrative }, { name: "segment", type: narrativeTypes.segmentRef },
    { name: "media", type: mediaTypes.synchronized }, { name: "domain", type: temporalTypes.localDomain },
    { name: "language", type: whisperXTypes.language }],
  operations: [
    { id: "prepare-evidence-audio", producer: speechEvidenceProducers.projectAudio,
      inputs: { media: input("media"), domain: input("domain") }, result: { kind: "need" as const, name: "evidenceAudio" } },
    { id: "request-whisperx", producer: whisperXProducers.request,
      inputs: { evidence: operation("prepare-evidence-audio"), language: input("language") }, result: { kind: "need" as const, name: "alignment" } },
    { id: "align-narrative", producer: speechAlignmentProducers.alignNarrative,
      inputs: { narrative: input("narrative"), segment: input("segment"),
        domain: input("domain"), evidence: operation("request-whisperx") },
      result: { kind: "output" as const, name: "alignment" } },
  ],
  exports: [{ name: "alignment", type: narrativeTemporalTypes.narrativeAlignment, root: operation("align-narrative") }],
});

export const whisperXBoundaryAlignmentFragment = sealGraphFragment({
  inputs: [{ name: "narrative", type: narrativeTypes.narrative }, { name: "segment", type: narrativeTypes.segmentRef },
    { name: "domain", type: temporalTypes.localDomain }],
  operations: [
    { id: "materialize-boundaries", producer: narrativeTemporalProducers.materializeSegmentBoundaries,
      inputs: { narrative: input("narrative"), segment: input("segment"), domain: input("domain") },
      result: { kind: "output" as const, name: "alignment" } },
  ],
  exports: [{ name: "alignment", type: narrativeTemporalTypes.narrativeAlignment, root: operation("materialize-boundaries") }],
});
