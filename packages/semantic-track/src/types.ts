import type { SemanticTake } from "@hypit/speech";

export type SemanticTrackItem = {
  readonly take: SemanticTake;
};

/**
 * The continuous program skeleton. Every item is a real SemanticTake and the
 * global frame domain is exactly their prefix sum: no gap or empty item exists.
 */
export type SemanticTrack = {
  readonly id: string;
  readonly narrativeId: string;
  readonly items: readonly SemanticTrackItem[];
};

export type SemanticTrackSpan = {
  readonly item: SemanticTrackItem;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type LocatedFrameSpan = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};
