import type { ComponentPackage } from "@narratage/component-kit";
import type { SpeechAudioBasis, SpeechEvidenceAudio } from "@narratage/speech";
import type { CanonicalValue, StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

import { whisperXRequestForEvidenceAudio } from "./evidence.js";
import {
  whisperXImplementationDigests,
  whisperXProducers,
} from "./manifest.js";

function inline(value: StoredValue, subject: string): CanonicalValue {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}

export const whisperXComponent = {
  producers: [
    {
      producer: whisperXProducers.request,
      implementationDigest: whisperXImplementationDigests.request,
      handler: ({ inputs }) => {
        const evidence = inline(inputs.evidence!.value, "SpeechEvidenceAudio") as unknown as SpeechEvidenceAudio;
        const audio = inline(inputs.audio!.value, "SpeechAudioBasis") as unknown as SpeechAudioBasis;
        return {
          outputs: {},
          needs: { alignment: canonicalize(whisperXRequestForEvidenceAudio(evidence, audio)) },
        };
      },
    },
  ],
} satisfies ComponentPackage;
