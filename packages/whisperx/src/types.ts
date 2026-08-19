import type { SpeechEvidenceAudio } from "@hypit/speech";

export type WhisperXAlignmentRequest = {
  readonly audio: SpeechEvidenceAudio["artifact"];
  readonly sampleFrames: number;
  readonly language?: string;
};
