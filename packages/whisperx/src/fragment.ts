import { narrativeTypes } from "@narratage/narrative";
import { speechTypes } from "@narratage/speech";
import { speechEvidenceTypes } from "@narratage/speech-evidence";
import { semanticMapTypes } from "@narratage/semantic-map";
import { sealGraphFragment } from "@narratage/elaborator";
import { mediaPipelineProducers } from "@narratage/media-pipeline";
import { speechAlignmentProducers } from "@narratage/speech-alignment";

import { whisperXProducers, whisperXTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** One measured acoustic pass followed by provider-neutral deterministic Script alignment. */
export const whisperXSpeechAlignmentFragment = sealGraphFragment({
  name: "@narratage/whisperx/speech-alignment@1",
  inputs: [
    { name: "narrative", type: narrativeTypes.narrative },
    { name: "audio", type: speechTypes.audioBasis },
  ],
  operations: [
    {
      id: "prepare-evidence-audio",
      producer: mediaPipelineProducers.projectSpeechEvidenceAudio,
      inputs: { audio: input("audio") },
      result: { kind: "need", name: "evidenceAudio" },
    },
    {
      id: "request-whisperx",
      producer: whisperXProducers.request,
      inputs: { audio: operation("prepare-evidence-audio") },
      result: { kind: "need", name: "alignment" },
    },
    {
      id: "normalize-evidence",
      producer: whisperXProducers.normalize,
      inputs: { whisperx: operation("request-whisperx") },
      result: { kind: "output", name: "evidence" },
    },
    {
      id: "locate-speech",
      producer: speechAlignmentProducers.locate,
      inputs: { narrative: input("narrative"), audio: input("audio"), evidence: operation("normalize-evidence") },
      result: { kind: "output", name: "map" },
    },
  ],
  exports: [
    {
      name: "rawEvidence",
      type: whisperXTypes.alignmentEvidence,
      root: operation("request-whisperx"),
    },
    {
      name: "evidence",
      type: speechEvidenceTypes.alignedTranscript,
      root: operation("normalize-evidence"),
    },
    {
      name: "map",
      type: semanticMapTypes.complete,
      root: operation("locate-speech"),
    },
  ],
});
