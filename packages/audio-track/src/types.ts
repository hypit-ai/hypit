import type { FrameSpan } from "@hypit/timeline";
import type { PreparedMedia } from "@hypit/media";
import type {
  ExactTemporalValue,
  TemporalMap,
  TemporalDuration,
  TemporalRelationSpec,
} from "@hypit/temporal";

export type AudioClipMix = {
  readonly gain: number;
  readonly fadeIn: TemporalDuration;
  readonly fadeOut: TemporalDuration;
};

export type AudioClipSpec = {
  readonly id: string;
  /** Omission means bounded partial identity. */
  readonly sampling?: TemporalRelationSpec;
  readonly mix: AudioClipMix;
};

export type AudioTrackHeader = {
  readonly id: string;
};

export type AudioClipProgram = {
  readonly id: string;
  /** Author-owned Clip realized by this absolute destination Window. */
  readonly subjectId: string;
  readonly window: FrameSpan;
  readonly source: {
    /** Logical source identity; terminal execution remains outside the component. */
    readonly media: PreparedMedia;
  };
  /** Exact occurrence-local to PreparedMedia-local relation owned by this Clip. */
  readonly sampling: TemporalMap;
  readonly mix: {
    readonly gain: number;
    readonly fadeIn: ExactTemporalValue;
    readonly fadeOut: ExactTemporalValue;
  };
};

export type AudioTrackProgram = {
  readonly id: string;
  readonly clips: readonly AudioClipProgram[];
};

export type AudioTrackSet = {
  readonly clips: readonly AudioClipProgram[];
};
