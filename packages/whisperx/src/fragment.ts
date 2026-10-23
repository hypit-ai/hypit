import { mediaTypes } from "@hypit/media";
import { sealGraphFragment } from "@hypit/hypit/author";
import { speechEvidenceProducers, speechEvidenceTypes } from "@hypit/speech-evidence";

import { whisperXProducers, whisperXTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const whisperXTranscriptionFragment = sealGraphFragment({
  inputs: [{ name: "media", type: mediaTypes.synchronized }, { name: "language", type: whisperXTypes.language }],
  operations: [
    { id: "prepare-evidence-audio", producer: speechEvidenceProducers.projectAudio,
      inputs: { media: input("media") }, result: { kind: "need" as const, name: "evidenceAudio" } },
    { id: "request-whisperx", producer: whisperXProducers.request,
      inputs: { evidence: operation("prepare-evidence-audio"), language: input("language") },
      result: { kind: "need" as const, name: "transcript" } },
  ],
  exports: [{ name: "transcript", type: speechEvidenceTypes.transcript, root: operation("request-whisperx") }],
});
