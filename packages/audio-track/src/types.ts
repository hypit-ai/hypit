import type { AudioTrack, FrameSpan } from "@narratage/composition";
import type { BlobRef } from "@narratage/protocol";
import type {
  OccurrenceExpansion,
  TemporalDuration,
  TemporalWindowProjection,
} from "@narratage/temporal";

export type AudioOccupancy =
  | { readonly mode: "once"; readonly align: "start" | "end" }
  | { readonly mode: "loop"; readonly align: "start" | "end" }
  | { readonly mode: "stretch"; readonly minRate: number; readonly maxRate: number; readonly pitch: "preserve" };

export type AudioSourceTrim = {
  readonly start?: TemporalDuration;
  readonly end?: TemporalDuration;
};

export type AudioItemMix = {
  readonly gain: number;
  readonly fadeIn: TemporalDuration;
  readonly fadeOut: TemporalDuration;
};

export type AudioClipSpec = {
  readonly contract: "svml.audio-clip-spec@1";
  readonly id: string;
  readonly projection: TemporalWindowProjection;
  readonly expansion: OccurrenceExpansion;
  readonly trim: AudioSourceTrim;
  readonly occupancy: AudioOccupancy;
  readonly mix: AudioItemMix;
};

export type AudioTrackHeader = {
  readonly contract: "svml.audio-track-header@1";
  readonly id: string;
};

export type AudioItemProgram = {
  readonly id: string;
  readonly sourceOccurrenceId: string;
  readonly window: FrameSpan;
  readonly source: {
    readonly artifact: BlobRef;
    readonly sampleFrames: number;
  };
  readonly trim: {
    readonly startSample: number;
    readonly endSampleExclusive: number;
  };
  readonly occupancy: AudioOccupancy;
  readonly mix: {
    readonly gain: number;
    readonly fadeInSamples: number;
    readonly fadeOutSamples: number;
  };
};

export type AudioTrackProgram = {
  readonly contract: "svml.audio-track-program@1";
  readonly id: string;
  readonly items: readonly AudioItemProgram[];
};

export type AudioTrackSet = {
  readonly contract: "svml.audio-track-set@1";
  readonly items: readonly AudioItemProgram[];
};

export type AudioTrackProduct = {
  readonly contract: "svml.audio-track-product@1";
  readonly track: AudioTrack;
};
