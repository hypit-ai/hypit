import type { ContentFit, SpatialFrame } from "@hypit/spatial";

/** Author-owned policy for one ordered Speech Spine. */
export type SpeechSpineProgram = {
  readonly id: string;
  readonly frameRate: {
    readonly numerator: number;
    readonly denominator: number;
  };
};

export type SpeechSpineTake = {
  readonly semantic: import("@hypit/speech").SemanticTake;
  readonly visual?: {
    readonly frame: SpatialFrame;
    readonly fit: ContentFit;
    readonly stackingOrder: number;
  };
};

export type SpeechSpineVisualSpec = {
  readonly stackingOrder: number;
};

/**
 * Package-private immutable fold value. Its order is author meaning; Core sees
 * only fixed-port append Operations for the concrete Spine declaration.
 */
export type SpeechSpineSet = {
  readonly takes: readonly SpeechSpineTake[];
};

export type SpeechSpineInput = {
  readonly takeName: string;
  readonly visual?: {
    readonly frameName: string;
    readonly fitName: string;
    readonly visualSpecName: string;
  };
};

export type SpeechSpineFragmentOptions = {
  readonly name?: string;
  readonly takes: readonly SpeechSpineInput[];
};
