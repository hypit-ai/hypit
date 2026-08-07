import type { BlobRef } from "@narratage/protocol";

export type GeneratedImageSet = {
  readonly contract: "svml.generated-image-set@1";
  readonly images: readonly BlobRef[];
};

export type GeneratedVideoSet = {
  readonly contract: "svml.generated-video-set@1";
  readonly videos: readonly BlobRef[];
};

export type GeneratedImageSetContent = GeneratedImageSet;
export type GeneratedVideoSetContent = GeneratedVideoSet;
