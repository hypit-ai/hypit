import { canonicalize } from "@hypit/hypit/protocol";
import type { CanonicalValue, Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { SpeechEvidenceAudio } from "@hypit/speech-evidence";

import { whisperXRequestForEvidenceAudio } from "./evidence.js";
import { whisperXProducers } from "./manifest.js";
import { parseWhisperXLanguage } from "./types.js";

function valueOf(value: Value, subject: string): CanonicalValue {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value;
}

export const whisperXComponent = {
  producers: [
    {
      producer: whisperXProducers.request,
      handler: ({ inputs }) => {
        const evidence = valueOf(inputs.evidence!.value, "SpeechEvidenceAudio") as unknown as SpeechEvidenceAudio;
        const language = parseWhisperXLanguage(valueOf(inputs.language!.value, "WhisperXLanguage"));
        return { kind: "need", constraints: canonicalize(whisperXRequestForEvidenceAudio(evidence, { language })) };
      },
    },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
