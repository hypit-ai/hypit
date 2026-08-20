import { narrativeTypes } from "@hypit/narrative";
import { mediaTypes } from "@hypit/media";
import { speechTypes } from "@hypit/speech";
import { speechEvidenceTypes } from "@hypit/speech-evidence";
import { sealGraphFragment } from "@hypit/elaborator";
import { mediaPipelineProducers } from "@hypit/media-pipeline";
import { speechAlignmentProducers } from "@hypit/speech-alignment";

import { whisperXProducers } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Normalize one Take's audio evidence, measure it, then project one Script Segment locally. */
export const whisperXSemanticTakeFragment = sealGraphFragment({
  inputs: [
    { name: "narrative", type: narrativeTypes.narrative },
    { name: "segment", type: narrativeTypes.excerpt },
    { name: "media", type: mediaTypes.synchronized },
  ],
  operations: [
    {
      id: "prepare-evidence-audio",
      producer: mediaPipelineProducers.projectSpeechEvidenceAudio,
      inputs: { media: input("media") },
      result: { kind: "need", name: "evidenceAudio" },
    },
    {
      id: "request-whisperx",
      producer: whisperXProducers.request,
      inputs: { evidence: operation("prepare-evidence-audio") },
      result: { kind: "need", name: "alignment" },
    },
    {
      id: "align-semantic-take",
      producer: speechAlignmentProducers.alignTake,
      inputs: {
        narrative: input("narrative"),
        segment: input("segment"),
        media: input("media"),
        evidence: operation("request-whisperx"),
      },
      result: { kind: "output", name: "take" },
    },
  ],
  exports: [
    {
      name: "evidence",
      type: speechEvidenceTypes.alignedTranscript,
      root: operation("request-whisperx"),
    },
    {
      name: "take",
      type: speechTypes.semanticTake,
      root: operation("align-semantic-take"),
    },
  ],
});
