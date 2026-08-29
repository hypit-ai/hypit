import type { SpeechEvidenceAudio } from "@hypit/speech";

export type WhisperXLanguage = "en" | "zh" | "es";

export type WhisperXAlignmentRequest = {
  readonly audio: SpeechEvidenceAudio["artifact"];
  readonly sampleFrames: number;
  readonly language: WhisperXLanguage;
};
