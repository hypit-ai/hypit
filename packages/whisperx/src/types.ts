import type { SpeechBasisSegment, SpeechEvidenceAudio } from "@narratage/speech";
import type { AlignedTranscriptSegment } from "@narratage/speech-evidence";

export type WhisperXAlignmentRequest = {
  readonly contract: "svml.whisperx-alignment-request@1";
  readonly audio: SpeechEvidenceAudio["artifact"];
  readonly sampleFrames: number;
  readonly segments: readonly SpeechBasisSegment[];
  readonly language?: string;
};
