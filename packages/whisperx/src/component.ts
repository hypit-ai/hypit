import type { ComponentPackage } from "@hypit/component-kit";
import type { SpeechEvidenceAudio } from "@hypit/speech";
import type { CanonicalValue, StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";

import { whisperXRequestForEvidenceAudio } from "./evidence.js";
import { whisperXProducers } from "./manifest.js";

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
        return {
          outputs: {},
          needs: { alignment: canonicalize(whisperXRequestForEvidenceAudio(evidence)) },
        };
      },
    },
  ],
} satisfies ComponentPackage;
