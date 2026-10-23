import type { SpeechEvidenceAudio } from "@hypit/speech-evidence";

/** Explicit language code. Executable language support belongs to the selected service. */
export type WhisperXLanguage = string;

export function parseWhisperXLanguage(value: unknown, subject = "WhisperX language"): WhisperXLanguage {
  if (typeof value !== "string" || !/^[a-z]{2,3}$/u.test(value) || value === "und") {
    throw new Error(`${subject} must be an explicit lowercase two- or three-letter spoken language code, such as en, zh, or ko; auto and und are not explicit languages`);
  }
  return value;
}

export type WhisperXTranscriptionRequest = {
  readonly audio: SpeechEvidenceAudio["artifact"];
  readonly sampleFrames: number;
  readonly language: WhisperXLanguage;
};
