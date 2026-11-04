import type { BlobRef } from "@hypit/hypit/protocol";
import type { FrameSpan, TemporalRate } from "@hypit/temporal";

/** Relative authored holding weights, one per picture in source order. */
export type StillVideoLayout = {
  readonly weights: readonly number[];
};

export type StillVideoSegment = FrameSpan & {
  readonly source?: BlobRef;
};

/** One exact video-only materialization request on its consumer-selected sampling grid. */
export type StillVideoRequest = {
  readonly frameRate: TemporalRate;
  readonly frameCount: number;
  readonly segments: readonly StillVideoSegment[];
};

export type RenderStillVideoNeed = {
  readonly request: StillVideoRequest;
};
