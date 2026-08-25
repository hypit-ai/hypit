import type { ComponentPackage } from "@hypit/component-kit";
import type { StoredValue } from "@hypit/protocol";

import {
  assertSemanticTakeIdentity,
  assertSpeechDurationIdentity,
  assertSpeechEvidenceAudioIdentity,
} from "./identity.js";
import { speechTypes } from "./manifest.js";
import type { SemanticTake, SpeechDuration, SpeechEvidenceAudio } from "./types.js";

function inline<T>(value: StoredValue, subject: string): T {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline.`);
  return value.value as T;
}

export const speechComponent = {
  validators: [
    { type: speechTypes.duration, handler: ({ value }) => assertSpeechDurationIdentity(inline<SpeechDuration>(value, "SpeechDuration")) },
    { type: speechTypes.evidenceAudio, handler: ({ value }) => assertSpeechEvidenceAudioIdentity(inline<SpeechEvidenceAudio>(value, "SpeechEvidenceAudio")) },
    { type: speechTypes.semanticTake, handler: ({ value }) => assertSemanticTakeIdentity(inline<SemanticTake>(value, "SemanticTake")) },
  ],
} satisfies ComponentPackage;
