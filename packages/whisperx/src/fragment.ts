import { sealGraphFragment } from "@hypit/hypit/author";
import { speechEvidenceTypes } from "@hypit/speech-evidence";
import { timedTranscriptTypes } from "@hypit/timed-transcript";

import {
  whisperXModuleRef,
  whisperXProducers,
  whisperXTypes,
} from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Logical operation exposed by the WhisperX package, independent of any Provider. */
export const whisperXGenerationNodes = {
  transcribe: { module: whisperXModuleRef, name: "transcribe" },
} as const;

/**
 * Turn exact speech evidence into a typed transcript Need.
 *
 * The graph node owns neither media preparation nor Provider selection. The
 * Runtime resolves the transcription Capability using the active profile.
 */
export const whisperXTranscriptionFragment = sealGraphFragment({
  inputs: [
    { name: "evidence", type: speechEvidenceTypes.audio },
    { name: "language", type: whisperXTypes.language },
  ],
  operations: [{
    id: "transcribe",
    producer: whisperXProducers.request,
    inputs: {
      evidence: input("evidence"),
      language: input("language"),
    },
    result: { kind: "need", name: "transcript" },
  }],
  exports: [{
    name: "transcript",
    type: timedTranscriptTypes.transcript,
    root: operation("transcribe"),
  }],
});
