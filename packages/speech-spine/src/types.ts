import type { NarrativeExcerpt } from "@narratage/narrative";
import type { SynchronizedMedia } from "@narratage/media";
import type { ContentFit, SpatialFrame } from "@narratage/spatial";

/** Author-owned policy for one ordered Speech Spine. */
export type SpeechSpineProgram = {
  readonly id: string;
  readonly frameRate: {
    readonly numerator: number;
    readonly denominator: number;
  };
};

export type SpeechSpineTake = {
  readonly segment: NarrativeExcerpt;
  readonly media: SynchronizedMedia;
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
  readonly mediaName: string;
  readonly segmentName: string;
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
