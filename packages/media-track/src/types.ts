import type { FrameSpan } from "@narratage/composition";
import type { MediaArtifactRef } from "@narratage/media";
import type { ContentFit, IntrinsicExtent, SpatialFrame } from "@narratage/spatial";

export type MediaFramePresentation = {
  readonly clip: "frame";
  readonly fill: { readonly kind: "transparent" };
};

export type MediaStillLayerProgram = {
  readonly id: string;
  readonly kind: "still";
  readonly artifact: MediaArtifactRef;
  readonly extent: IntrinsicExtent;
  readonly fit: ContentFit;
};

export type MediaItemProgram = {
  readonly id: string;
  readonly span: FrameSpan;
  readonly frame: SpatialFrame;
  readonly presentation: MediaFramePresentation;
  readonly layers: readonly MediaStillLayerProgram[];
  readonly stacking: {
    readonly order: number;
    readonly tieBreak: string;
  };
};

export type MediaTrackProgram = {
  readonly contract: "svml.media-track-program@1";
  readonly id: string;
  readonly items: readonly MediaItemProgram[];
};

export type MediaTrackHeader = {
  readonly contract: "svml.media-track-header@1";
  readonly id: string;
};

export type MediaStillItemSpec = {
  readonly contract: "svml.media-still-item-spec@1";
  readonly id: string;
  readonly stackingOrder: number;
  readonly presentation: MediaFramePresentation;
};

export type MediaTrackSet = {
  readonly contract: "svml.media-track-set@1";
  readonly items: readonly MediaItemProgram[];
};
