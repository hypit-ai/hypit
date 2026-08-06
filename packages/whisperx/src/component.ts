import type { ComponentPackage } from "@svml/component-kit";
import type { SpeechEvidenceAudio } from "@svml/contracts";
import type { CanonicalValue, StoredValue } from "@svml/protocol";
import { canonicalize } from "@svml/protocol";

import {
  normalizeWhisperXAlignment,
  whisperXRequestForEvidenceAudio,
} from "./evidence.js";
import {
  whisperXImplementationDigests,
  whisperXProducers,
} from "./manifest.js";
import type { WhisperXAlignmentEvidence } from "./types.js";

function inline(value: StoredValue, subject: string): CanonicalValue {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}

export const whisperXComponent = {
  name: "@svml/whisperx",
  producers: [
    {
      producer: whisperXProducers.request,
      implementationDigest: whisperXImplementationDigests.request,
      handler: ({ inputs }) => {
        const audio = inline(inputs.audio!.value, "SpeechEvidenceAudio") as unknown as SpeechEvidenceAudio;
        return {
          outputs: {},
          needs: { alignment: canonicalize(whisperXRequestForEvidenceAudio(audio)) },
        };
      },
    },
    {
      producer: whisperXProducers.normalize,
      implementationDigest: whisperXImplementationDigests.normalize,
      handler: ({ inputs }) => {
        const evidence = inline(inputs.whisperx!.value, "WhisperXAlignmentEvidence") as unknown as WhisperXAlignmentEvidence;
        return {
          outputs: {
            evidence: { kind: "inline", value: canonicalize(normalizeWhisperXAlignment(evidence)) },
          },
          needs: {},
        };
      },
    },
  ],
} satisfies ComponentPackage;
