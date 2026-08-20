import type { ContentFit, SpatialFrame } from "@hypit/spatial";

/** Author-owned policy for one ordered Speech Track. */
export type SpeechTrackHeader = {
  readonly id: string;
};

export type SpeechTrackTake = {
  readonly semantic: import("@hypit/speech").SemanticTake;
  readonly visual?: {
    readonly frame: SpatialFrame;
    readonly fit: ContentFit;
    readonly stackingOrder: number;
  };
};

export type SpeechTrackVisualSpec = {
  readonly stackingOrder: number;
};

/**
 * Package-private immutable fold value. Its order is author meaning; Core sees
 * only fixed-port append Operations for the concrete Track declaration.
 */
export type SpeechTrackSet = {
  readonly takes: readonly SpeechTrackTake[];
};

export type SpeechTrackInput = {
  readonly takeName: string;
  readonly visual: {
    readonly frameName: string;
    readonly fitName: string;
    readonly visualSpecName: string;
  };
};

export type SpeechTrackFragmentOptions = {
  readonly takes: readonly SpeechTrackInput[];
};
