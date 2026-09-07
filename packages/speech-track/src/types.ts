import type { ContentFit, SpatialFrame } from "@hypit/spatial";
import type {
  MediaFramePresentation,
  MediaLifecycleMotion,
  MediaPaintLayerSpec,
  MediaSampleAppearance,
  MediaSamplingMotion,
} from "@hypit/media-track";

/** Author-owned policy for one ordered Speech Track. */
export type SpeechTrackHeader = {
  readonly id: string;
};

export type SpeechTrackTake = {
  readonly semantic: import("@hypit/speech").SemanticTake;
  readonly visual?: {
    readonly frame: SpatialFrame;
    readonly fit: ContentFit;
    readonly spec: SpeechTrackVisualSpec;
  };
};

export type SpeechTrackVisualSpec = {
  readonly stackingOrder: number;
  readonly presentation: MediaFramePresentation;
  readonly sampleAppearance: MediaSampleAppearance;
  readonly motion: MediaLifecycleMotion;
  readonly framePaint?: MediaPaintLayerSpec;
  readonly samplingMotion?: MediaSamplingMotion;
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
