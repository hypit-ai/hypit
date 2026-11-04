import type { BlobRef } from "@hypit/hypit/protocol";
import type { MediaAudioSelector, MediaVideoSelector } from "@hypit/media";

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
