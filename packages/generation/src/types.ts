import type { BlobRef } from "@hypit/protocol";

export type GeneratedImageSet = {
  readonly images: readonly BlobRef[];
};

export type GeneratedVideoSet = {
  readonly videos: readonly BlobRef[];
};

export type GeneratedAudioSet = {
  readonly audios: readonly BlobRef[];
};

export type GeneratedImageSetContent = GeneratedImageSet;
export type GeneratedVideoSetContent = GeneratedVideoSet;
export type GeneratedAudioSetContent = GeneratedAudioSet;
