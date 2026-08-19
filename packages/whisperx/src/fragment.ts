import { narrativeTypes } from "@hypit/narrative";
import { speechTypes } from "@hypit/speech";
import { speechEvidenceTypes } from "@hypit/speech-evidence";
import { semanticMapTypes } from "@hypit/semantic-map";
import { sealGraphFragment } from "@hypit/elaborator";
import { mediaPipelineProducers } from "@hypit/media-pipeline";
import { speechAlignmentProducers } from "@hypit/speech-alignment";

import { whisperXProducers } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** One measured acoustic pass followed by provider-neutral deterministic Script alignment. */
export const whisperXSpeechAlignmentFragment = sealGraphFragment({
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
      inputs: { evidence: operation("prepare-evidence-audio") },
      result: { kind: "need", name: "alignment" },
    },
    {
      id: "locate-speech",
      producer: speechAlignmentProducers.locate,
      inputs: { narrative: input("narrative"), audio: input("audio"), evidence: operation("request-whisperx") },
      result: { kind: "output", name: "map" },
    },
  ],
  exports: [
    {
      name: "evidence",
      type: speechEvidenceTypes.alignedTranscript,
      root: operation("request-whisperx"),
    },
    {
      name: "map",
      type: semanticMapTypes.complete,
      root: operation("locate-speech"),
    },
  ],
});
