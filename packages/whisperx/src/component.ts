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
  install(registry: import("@svml/component-kit").ProducerRegistrar): void {
    registry.registerProducer(
      whisperXProducers.request,
      whisperXImplementationDigests.request,
      ({ inputs }) => {
        const audio = inline(inputs.audio!.value, "SpeechEvidenceAudio") as unknown as SpeechEvidenceAudio;
        return {
          outputs: {},
          needs: { alignment: canonicalize(whisperXRequestForEvidenceAudio(audio)) },
        };
      },
    );
    registry.registerProducer(
      whisperXProducers.normalize,
      whisperXImplementationDigests.normalize,
      ({ inputs }) => {
        const evidence = inline(inputs.whisperx!.value, "WhisperXAlignmentEvidence") as unknown as WhisperXAlignmentEvidence;
        return {
          outputs: {
            evidence: { kind: "inline", value: canonicalize(normalizeWhisperXAlignment(evidence)) },
          },
          needs: {},
        };
      },
    );
  },
};
