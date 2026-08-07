import type {
  NarrativeExcerpt,
  SynchronizedMedia,
} from "@svml/contracts";

/** Author-owned policy for one ordered Speech Spine. */
export type SpeechSpineProgram = {
  readonly contract: "svml.speech-spine-program@1";
  readonly id: string;
  readonly frameRate: {
    readonly numerator: number;
    readonly denominator: number;
  };
};

export type SpeechSpineTake = {
  readonly segment: NarrativeExcerpt;
  readonly media: SynchronizedMedia;
};

/**
 * Package-private immutable fold value. Its order is author meaning; Core sees
 * only fixed-port append Operations for the concrete Spine declaration.
 */
export type SpeechSpineSet = {
  readonly contract: "svml.speech-spine-set@1";
  readonly takes: readonly SpeechSpineTake[];
};

export type SpeechSpineInput = {
  readonly mediaName: string;
  readonly segmentName: string;
};

export type SpeechSpineFragmentOptions = {
  readonly name?: string;
  readonly takes: readonly SpeechSpineInput[];
};
