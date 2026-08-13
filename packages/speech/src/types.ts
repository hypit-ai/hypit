import type { ProgramSpace } from "@narratage/program-space";
import type { BlobRef } from "@narratage/protocol";
import type { ContentFit, IntrinsicExtent, SpatialFrame } from "@narratage/spatial";
/** Positive seconds. The graph port's TypeRef already carries the SpeechDuration identity. */
export type SpeechDuration = number;
export type SpeechBasisSegment = { readonly segmentId: string; readonly startSec: number; readonly endSec: number };
export type SpeechBasis = {
  readonly programSpace: ProgramSpace; readonly audio: BlobRef;
  readonly visualTrack: { readonly clips: readonly {
    readonly segmentId: string;
    readonly artifact: BlobRef;
    readonly extent: IntrinsicExtent;
    readonly frame: SpatialFrame;
    readonly fit: ContentFit;
    readonly stackingOrder: number;
  }[] };
  readonly segments: readonly SpeechBasisSegment[];
};
export type SpeechAudioBasis = {
  readonly programSpace: ProgramSpace; readonly audio: BlobRef;
  readonly segments: readonly SpeechBasisSegment[];
};
export type SpeechEvidenceAudio = {
  readonly artifact: BlobRef;
  /** Exact 16 kHz mono PCM sample count. Format constants belong to this Type, not every value. */
  readonly sampleFrames: number;
};
