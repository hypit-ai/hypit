import type { ComponentPackage } from "@hypit/component-kit";
import type { SpeechEvidenceAudio } from "@hypit/speech";
import type { CanonicalValue, StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";

import { whisperXRequestForEvidenceAudio } from "./evidence.js";
import { whisperXProducers } from "./manifest.js";
import type { WhisperXLanguage } from "./types.js";

function inline(value: StoredValue, subject: string): CanonicalValue {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}

export const whisperXComponent = {
  producers: [
    {
      producer: whisperXProducers.request,
      handler: ({ inputs }) => {
        const evidence = inline(inputs.evidence!.value, "SpeechEvidenceAudio") as unknown as SpeechEvidenceAudio;
        const language = inline(inputs.language!.value, "WhisperXLanguage") as unknown as WhisperXLanguage;
        if (language !== "en" && language !== "zh" && language !== "es") {
          throw new Error("WhisperXLanguage must be en, zh, or es");
        }
        return {
          outputs: {},
          needs: { alignment: canonicalize(whisperXRequestForEvidenceAudio(evidence, { language })) },
        };
      },
    },
  ],
} satisfies ComponentPackage;
