import type { BlobRef } from "@hypit/hypit/protocol";

export type GeneratedImageSet = {
  readonly images: readonly BlobRef[];
};

export type GeneratedVideoSet = {
  readonly videos: readonly BlobRef[];
};

export type GeneratedAudioSet = {
  readonly audios: readonly BlobRef[];
};
