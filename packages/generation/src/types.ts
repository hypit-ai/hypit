import type { BlobRef } from "@narratage/protocol";

export type GeneratedImageSet = {
  readonly contract: "svml.generated-image-set@1";
  readonly images: readonly BlobRef[];
};

export type GeneratedVideoSet = {
  readonly contract: "svml.generated-video-set@1";
  readonly videos: readonly BlobRef[];
};

export type GeneratedAudioSet = {
  readonly contract: "svml.generated-audio-set@1";
  readonly audios: readonly BlobRef[];
};

export type GeneratedImageSetContent = GeneratedImageSet;
export type GeneratedVideoSetContent = GeneratedVideoSet;
export type GeneratedAudioSetContent = GeneratedAudioSet;
