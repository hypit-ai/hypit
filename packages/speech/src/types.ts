import type { ProgramSpace } from "@narratage/program-space";
import type { BlobRef } from "@narratage/protocol";
import type { IntrinsicExtent } from "@narratage/spatial";
export type SpeechDuration = { readonly contract: "svml.speech-duration@1"; readonly durationSec: number };
export type SpeechBasisSegment = { readonly segmentId: string; readonly startSec: number; readonly endSec: number };
export type SpeechBasis = {
  readonly contract: "svml.speech-basis@1"; readonly programSpace: ProgramSpace; readonly audio: BlobRef;
  readonly visualTrack: { readonly clips: readonly {
    readonly segmentId: string;
    readonly artifact: BlobRef;
    readonly extent: IntrinsicExtent;
    readonly frameRate: { readonly numerator: number; readonly denominator: number };
    readonly frameCount: number;
  }[] };
  readonly segments: readonly SpeechBasisSegment[];
};
export type SpeechAudioBasis = {
  readonly contract: "svml.speech-audio-basis@1"; readonly programSpace: ProgramSpace; readonly audio: BlobRef;
  readonly segments: readonly SpeechBasisSegment[];
};
export type SpeechEvidenceAudio = {
  readonly contract: "svml.speech-evidence-audio@1"; readonly artifact: BlobRef; readonly codec: "pcm_s16le";
  readonly sampleRate: 16_000; readonly channels: 1; readonly sampleFrames: number; readonly durationSec: number;
  readonly segments: readonly SpeechBasisSegment[];
  readonly sampleMap: { readonly algorithm: "rational-boundary-round@1"; readonly sourceSampleRate: 48_000; readonly evidenceSampleRate: 16_000;
    readonly sourceSampleFrames: number; readonly evidenceSampleFrames: number; readonly sourceOriginSample: 0; readonly evidenceOriginSample: 0 };
};
