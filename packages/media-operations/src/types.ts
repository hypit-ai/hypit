import type { BlobRef } from "@hypit/hypit/protocol";
import type { MediaRational } from "@hypit/media";
import type { FrameSpan } from "@hypit/timeline";
import type { ExactTemporalValue, TemporalRate } from "@hypit/temporal";

export type MediaSelectionRequest = {
  readonly video:
    | { readonly mode: "primary-moving" }
    | { readonly mode: "stream-index"; readonly streamIndex: number }
    | { readonly mode: "none" };
  readonly audio:
    | { readonly mode: "default" }
    | { readonly mode: "stream-index"; readonly streamIndex: number }
    | { readonly mode: "none" };
  readonly spanAuthority: "video" | "audio";
};

export type InspectMediaNeed = {
  readonly source: BlobRef;
};

export type MediaVideoSelector =
  | { readonly mode: "primary-moving" }
  | { readonly mode: "stream-index"; readonly streamIndex: number };

export type MediaAudioSelector =
  | { readonly mode: "default" }
  | { readonly mode: "stream-index"; readonly streamIndex: number }
  | { readonly mode: "none" };

export type MediaTransformOperation =
  | {
      readonly kind: "trim";
      /** Exact positions in the operation's current local domain. */
      readonly start?: ExactTemporalValue;
      readonly end?: ExactTemporalValue;
      readonly tail?: ExactTemporalValue;
    }
  | {
      readonly kind: "retime";
      /** Source-local advance per one target-local unit. */
      readonly rate: TemporalRate;
    }
  | {
      readonly kind: "retime-profile";
      /** Complete, ordered traversal of the current source domain. */
      readonly knots: readonly MediaTransformRateKnot[];
    };

/** One inward offset from a current PreparedMedia domain edge. */
export type MediaTransformRelativePoint = {
  readonly edge: "start" | "end";
  readonly offset: ExactTemporalValue;
};

/** One source-local position and its signed source-per-target rate. */
export type MediaTransformRateKnot = {
  readonly at: MediaTransformRelativePoint;
  readonly rate: TemporalRate;
};

/** Ordered, deterministic temporal operations over PreparedMedia. */
export type MediaTransformProgram = {
  readonly operations: readonly MediaTransformOperation[];
};

export type AudioExtractionRequest = {
  readonly audio: Exclude<MediaAudioSelector, { readonly mode: "none" }>;
  readonly output: {
    readonly container: "wav";
    readonly codec: "pcm_s16le";
    readonly sampleRate: 48_000;
    readonly channels: 2;
  };
};

export type FrameExtractionRequest = {
  readonly video: MediaVideoSelector;
  readonly at:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "frame"; readonly index: number }
    | { readonly kind: "time"; readonly seconds: number };
  readonly output: { readonly format: "png" };
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
  readonly output: {
    readonly container: "mp4";
    readonly codec: "h264";
    readonly pixelFormat: "yuv420p";
  };
  readonly segments: readonly StillVideoSegment[];
};

export type ExtractAudioNeed = {
  readonly source: BlobRef;
  readonly streamIndex: number;
  readonly output: AudioExtractionRequest["output"];
};

export type ExtractFrameNeed = {
  readonly source: BlobRef;
  readonly streamIndex: number;
  readonly sourceFrameCount: number;
  readonly at: FrameExtractionRequest["at"];
  readonly output: FrameExtractionRequest["output"];
};

/** Every segment of the request carries its picture by the time the Need is made. */
export type RenderStillVideoNeed = {
  readonly request: StillVideoRequest;
};
