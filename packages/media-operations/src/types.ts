import type { BlobRef } from "@hypit/hypit/protocol";
import type { MediaAudioSelector, MediaRational, MediaVideoSelector } from "@hypit/media";
import type { FrameSpan } from "@hypit/temporal";

export type AudioExtractionRequest = {
  readonly audio: Exclude<MediaAudioSelector,
    { readonly mode: "none" } | { readonly mode: "default-if-present" }>;
};

export type FrameExtractionRequest = {
  readonly video: Exclude<MediaVideoSelector, { readonly mode: "none" }>;
  readonly at:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "frame"; readonly index: number }
    | { readonly kind: "time"; readonly seconds: number };
};

/** How the still video divides its literal duration among its pictures: one weight per picture, in order. */
export type StillVideoLayout = {
  readonly weights: readonly number[];
};

/** One picture's span of the still video, in frames; `source` is bound one picture at a time. */
export type StillVideoSegment = FrameSpan & {
  readonly source?: BlobRef;
};

/** Exact video-only clip requested from one or more authored still images spread over a literal duration. */
export type StillVideoRequest = {
  readonly frameRate: MediaRational;
  readonly frameCount: number;
  readonly segments: readonly StillVideoSegment[];
};

export type ExtractAudioNeed = {
  readonly source: BlobRef;
  readonly streamIndex: number;
};

export type ExtractFrameNeed = {
  readonly source: BlobRef;
  readonly streamIndex: number;
  readonly sourceFrameCount: number;
  readonly at: FrameExtractionRequest["at"];
};

/** Every segment of the request carries its picture by the time the Need is made. */
export type RenderStillVideoNeed = {
  readonly request: StillVideoRequest;
};
