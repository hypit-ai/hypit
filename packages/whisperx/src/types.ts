import type { SpeechEvidenceAudio } from "@narratage/speech";

export type WhisperXAlignmentRequest = {
  readonly audio: SpeechEvidenceAudio["artifact"];
  readonly sampleFrames: number;
  readonly language?: string;
};
