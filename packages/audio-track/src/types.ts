import type { FrameSpan } from "@hypit/composition";
import type { BlobRef } from "@hypit/protocol";
import type {
  TemporalDuration,
} from "@hypit/temporal";

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
  readonly id: string;
  readonly trim: AudioSourceTrim;
  readonly occupancy: AudioOccupancy;
  readonly mix: AudioItemMix;
};

export type AudioTrackHeader = {
  readonly id: string;
};

export type AudioItemProgram = {
  readonly id: string;
  /** Author-owned Item realized by this externally projected window. */
  readonly subjectId: string;
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
  readonly id: string;
  readonly items: readonly AudioItemProgram[];
};

export type AudioTrackSet = {
  readonly items: readonly AudioItemProgram[];
};
