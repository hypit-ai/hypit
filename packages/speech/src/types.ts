import type { ProgramSpace } from "@hypit/program-space";
import type { BlobRef } from "@hypit/protocol";
import type { SynchronizedMedia } from "@hypit/media";
import type { ContentFit, IntrinsicExtent, SpatialFrame } from "@hypit/spatial";
import type { SemanticTimePoint } from "@hypit/semantic-map";
/** Positive seconds. The graph port's TypeRef already carries the SpeechDuration identity. */
export type SpeechDuration = number;
export type SpeechBasisSegment = {
  readonly segmentId: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};
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
export type SpeechEvidenceAudio = {
  readonly artifact: BlobRef;
  /** Exact 16 kHz mono PCM sample count. Format constants belong to this Type, not every value. */
  readonly sampleFrames: number;
};

/** One authored Script token located in one normalized Take's local frame domain. */
export type SemanticTakeToken = {
  readonly tokenId: string;
  readonly segmentId: string;
  readonly text: string;
  readonly startAnchorId: string;
  readonly endAnchorId: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

/**
 * A self-contained semantic media product. Media bytes remain ordinary BlobRefs
 * inside SynchronizedMedia; the authored word surface and its local frame
 * coordinates travel with this Take instead of requiring a second Script edge.
 */
export type SemanticTake = {
  readonly media: SynchronizedMedia;
  readonly segment: {
    readonly segmentId: string;
    readonly startAnchorId: string;
    readonly endAnchorId: string;
    readonly startFrame: number;
    readonly endFrameExclusive: number;
  };
  readonly tokens: readonly SemanticTakeToken[];
  readonly anchors: readonly SemanticTimePoint[];
};
