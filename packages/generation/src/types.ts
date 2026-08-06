import type { BlobRef, Digest } from "@svml/protocol";

export type GeneratedImageSet = {
  readonly contract: "svml.generated-image-set@1";
  /** Provider-neutral model identity requested by the author module. */
  readonly model: string;
  readonly requestDigest: Digest;
  readonly images: readonly BlobRef[];
  readonly resultDigest: Digest;
};

export type GeneratedVideoSet = {
  readonly contract: "svml.generated-video-set@1";
  /** Provider-neutral model identity requested by the author module. */
  readonly model: string;
  readonly requestDigest: Digest;
  readonly requestedDurationSec: number;
  readonly videos: readonly BlobRef[];
  readonly resultDigest: Digest;
};

export type GeneratedImageSetContent = Omit<GeneratedImageSet, "resultDigest">;
export type GeneratedVideoSetContent = Omit<GeneratedVideoSet, "resultDigest">;
