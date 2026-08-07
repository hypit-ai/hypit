import { contractTypes } from "@narratage/contracts";
import { sealGraphFragment } from "@narratage/elaborator";
import { mediaPipelineProducers } from "@narratage/media-pipeline";
import { speechAlignProducers } from "@narratage/speech-align";

import { whisperXProducers, whisperXTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** One measured acoustic pass followed by provider-neutral deterministic Script alignment. */
export const whisperXSpeechAlignmentFragment = sealGraphFragment({
  name: "@narratage/whisperx/speech-alignment@1",
  inputs: [
    { name: "narrative", type: contractTypes.narrative },
    { name: "audio", type: contractTypes.speechAudioBasis },
  ],
  operations: [
    {
      id: "prepare-evidence-audio",
      producer: mediaPipelineProducers.projectSpeechEvidenceAudio,
      inputs: { audio: input("audio") },
      result: { kind: "need", name: "evidenceAudio", accepts: "exact" },
    },
    {
      id: "request-whisperx",
      producer: whisperXProducers.request,
      inputs: { audio: operation("prepare-evidence-audio") },
      result: { kind: "need", name: "alignment", accepts: "exact" },
    },
    {
      id: "normalize-evidence",
      producer: whisperXProducers.normalize,
      inputs: { whisperx: operation("request-whisperx") },
      result: { kind: "output", name: "evidence" },
    },
    {
      id: "locate-speech",
      producer: speechAlignProducers.locate,
      inputs: { narrative: input("narrative"), audio: input("audio"), evidence: operation("normalize-evidence") },
      result: { kind: "output", name: "map" },
    },
  ],
  exports: [
    {
      name: "rawEvidence",
      type: whisperXTypes.alignmentEvidence,
      root: operation("request-whisperx"),
      semanticInputs: ["audio"],
      fidelity: "exact",
    },
    {
      name: "evidence",
      type: contractTypes.alignedTranscriptEvidence,
      root: operation("normalize-evidence"),
      semanticInputs: ["audio"],
      fidelity: "exact",
    },
    {
      name: "map",
      type: contractTypes.completeSemanticMap,
      root: operation("locate-speech"),
      semanticInputs: ["narrative", "audio"],
      fidelity: "exact",
    },
  ],
});
