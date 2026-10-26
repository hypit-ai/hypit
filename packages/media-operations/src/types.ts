import type { AudioLevelAutomation } from "@hypit/composition";
import type { BlobRef } from "@hypit/hypit/protocol";
import type { MediaDeliverySpec, MediaRational, PreparedAudioSource, TimelineVisual, TimelineAudio } from "@hypit/media";
import type { FrameSpan } from "@hypit/timeline";
import type { ExactTemporalValue, TemporalMap, TemporalRate } from "@hypit/temporal";

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

export type AudioProgramClip = AudioLevelAutomation & {
  readonly id: string;
  /** Renderer input group shared by all sampling pieces of one source Clip. */
  readonly inputId: string;
  readonly source: PreparedAudioSource;
  /** Prepared-local to selected source-presentation relation. */
  readonly preparation: TemporalMap;
  readonly targetStartSample: number;
  readonly targetEndSampleExclusive: number;
  /** Sample domain and occurrence sampling positions before preparation is evaluated. */
  readonly preparedSampleFrames: number;
  readonly preparedStartSample: number;
  readonly preparedEndSampleExclusive: number;
  readonly loop: boolean;
  readonly loopPhaseSample: number;
  /** Exact tempo ratio; Audio execution preserves pitch. */
  readonly playbackRate: MediaRational;
  /** Complete owning Clip Window; fades do not restart at sampling-piece boundaries. */
  readonly mixStartSample: number;
  readonly mixEndSampleExclusive: number;
  readonly gain: number;
  readonly fadeInSamples: number;
  readonly fadeOutSamples: number;
};

/** Pure, provider-independent audio program. Executing it is always a Provider Need. */
export type AudioProgram = {
  readonly frameRate: MediaRational;
  readonly frameCount: number;
  readonly sampleRate: 48_000;
  readonly sampleFrames: number;
  readonly clips: readonly AudioProgramClip[];
};

export type RenderAudioNeed = {
  readonly program: AudioProgram;
  readonly range?: FrameSpan;
};

export type MuxMediaNeed = {
  readonly visual: TimelineVisual;
  readonly audio: TimelineAudio;
  readonly delivery: MediaDeliverySpec;
};
