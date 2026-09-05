import type { BlobRef } from "@hypit/protocol";
import type { MediaFrameRange, MediaInspection, MediaRational, MediaStreamSelection, RenderedVisual, TimelineAudio } from "@hypit/media";

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
  readonly frameRate: MediaRational;
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
      /** Seconds in the operation's current timeline, not necessarily the source timeline. */
      readonly startSec?: number;
      readonly endSec?: number;
      readonly tailSec?: number;
    }
  | {
      readonly kind: "retime";
      /** 2 means twice as fast and therefore half as long. */
      readonly rate: number;
      readonly pitch: "preserve";
    };

/** Ordered, deterministic A/V operations over already synchronized media. */
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
export type StillVideoSegment = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly source?: BlobRef;
};

/** Exact silent video requested from one or more authored still images spread over a literal duration. */
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

export type TransformMediaNeed = {
  readonly media: import("@hypit/media").SynchronizedMedia;
  readonly program: MediaTransformProgram;
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

export type NormalizeMediaNeed = {
  readonly source: BlobRef;
  readonly inspection: MediaInspection;
  readonly selection: MediaStreamSelection;
  readonly frameRate: MediaRational;
  readonly audio: {
    readonly sampleRate: 48_000;
    readonly channels: 2;
    readonly codec: "pcm_s16le";
    readonly loudness: "preserve";
  };
};

export type ProjectSpeechEvidenceAudioNeed = {
  readonly source: BlobRef;
  readonly sourceSampleFrames: number;
  readonly evidenceSampleFrames: number;
};

export type AudioProgramClip = {
  readonly id: string;
  readonly artifact: BlobRef;
  readonly targetStartSample: number;
  readonly targetEndSampleExclusive: number;
  readonly sourceSampleFrames: number;
  readonly sourceStartSample: number;
  readonly sourceEndSampleExclusive: number;
  readonly sourceLoop: boolean;
  readonly sourcePhaseSample: number;
  readonly playbackRate: number;
  readonly pitch: "preserve";
  readonly gain: number;
  readonly fadeInSamples: number;
  readonly fadeOutSamples: number;
};

/** Pure media plan. Executing it is always a Provider Need. */
export type AudioProgramPlan = {
  readonly frameRate: MediaRational;
  readonly frameCount: number;
  readonly sampleRate: 48_000;
  readonly sampleFrames: number;
  readonly clips: readonly AudioProgramClip[];
  readonly mix: {
    readonly normalize: false;
    readonly limiter: "none";
  };
};

export type RenderAudioNeed = {
  readonly plan: AudioProgramPlan;
  readonly range?: MediaFrameRange;
};

export type MuxMediaNeed = {
  readonly visual: RenderedVisual;
  readonly audio: TimelineAudio;
};
