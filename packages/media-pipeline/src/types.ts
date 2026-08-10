import type { BlobRef } from "@narratage/protocol";
import type { MediaInspection, MediaRational, MediaStreamSelection, RenderedVisual, TimelineAudio } from "@narratage/media";
import type { SpeechBasisSegment } from "@narratage/speech";

export type MediaSelectionRequest = {
  readonly contract: "svml.media-selection-request@1";
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
  readonly contract: "svml.inspect-media-request@1";
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
  readonly contract: "svml.media-transform-program@1";
  readonly operations: readonly MediaTransformOperation[];
};

export type AudioExtractionRequest = {
  readonly contract: "svml.audio-extraction-request@1";
  readonly audio: Exclude<MediaAudioSelector, { readonly mode: "none" }>;
  readonly output: {
    readonly container: "wav";
    readonly codec: "pcm_s16le";
    readonly sampleRate: 48_000;
    readonly channels: 2;
  };
};

export type FrameExtractionRequest = {
  readonly contract: "svml.frame-extraction-request@1";
  readonly video: MediaVideoSelector;
  readonly at:
    | { readonly kind: "first" }
    | { readonly kind: "last" }
    | { readonly kind: "frame"; readonly index: number }
    | { readonly kind: "time"; readonly seconds: number };
  readonly output: { readonly format: "png" };
};

export type TransformMediaNeed = {
  readonly contract: "svml.transform-media-request@1";
  readonly media: import("@narratage/media").SynchronizedMedia;
  readonly program: MediaTransformProgram;
};

export type ExtractAudioNeed = {
  readonly contract: "svml.extract-audio-request@1";
  readonly source: BlobRef;
  readonly streamIndex: number;
  readonly output: AudioExtractionRequest["output"];
};

export type ExtractFrameNeed = {
  readonly contract: "svml.extract-frame-request@1";
  readonly source: BlobRef;
  readonly streamIndex: number;
  readonly sourceFrameCount: number;
  readonly at: FrameExtractionRequest["at"];
  readonly output: FrameExtractionRequest["output"];
};

export type NormalizeMediaNeed = {
  readonly contract: "svml.normalize-media-request@1";
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
  readonly contract: "svml.project-speech-evidence-audio-request@1";
  readonly source: BlobRef;
  readonly sourceSampleRate: 48_000;
  readonly sourceChannels: 2;
  readonly sourceCodec: "pcm_s16le";
  readonly sourceSampleFrames: number;
  readonly evidenceSampleRate: 16_000;
  readonly evidenceChannels: 1;
  readonly evidenceCodec: "pcm_s16le";
  readonly evidenceSampleFrames: number;
  readonly durationSec: number;
  readonly segments: readonly SpeechBasisSegment[];
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

/** Pure, content-addressed plan. Executing it is always a Provider Need. */
export type AudioProgramPlan = {
  readonly contract: "svml.audio-program-plan@1";
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
  readonly contract: "svml.render-audio-request@1";
  readonly plan: AudioProgramPlan;
};

export type MuxMediaNeed = {
  readonly contract: "svml.mux-media-request@1";
  readonly visual: RenderedVisual;
  readonly audio: TimelineAudio;
};
