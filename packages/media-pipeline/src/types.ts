import type { BlobRef } from "@narratage/protocol";
import type {
  MediaInspection,
  MediaRational,
  MediaStreamSelection,
  RenderedVisual,
  TimelineAudio,
  SpeechBasisSegment,
} from "@narratage/contracts";

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
  readonly sourceStartSample: number;
  readonly playbackRate: number;
  readonly gain: number;
  readonly fadeInSamples: number;
  readonly fadeOutSamples: number;
  readonly bus: "speech" | "music" | "sfx" | "source";
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
