import type { AudioGraph, PictureGraph } from "@hypit/audiovisual";
import type { ExactTemporalValue, TemporalRange } from "@hypit/temporal/algebra";

export type SplitOccurrenceOptions = {
  readonly at: ExactTemporalValue;
  readonly leftId: string;
  readonly rightId: string;
};

export type SplitUseNodeIds = {
  readonly left: string;
  readonly right: string;
};

export type SplitPictureGraphPlan =
  | {
      /** Safe only when the split Occurrence is referenced by use nodes, never by a Control binding. */
      readonly kind: "split-uses";
      readonly uses: Readonly<Record<string, SplitUseNodeIds>>;
    }
  | {
      /** Explicit graph surgery for controlled or otherwise structurally coupled branches. */
      readonly kind: "replace";
      readonly graph: PictureGraph;
    };

export type SplitAudioGraphPlan =
  | {
      /** Safe only when the split Occurrence is referenced by use nodes, never by a Control binding. */
      readonly kind: "split-uses";
      readonly uses: Readonly<Record<string, SplitUseNodeIds>>;
    }
  | {
      /** Explicit graph surgery for controlled or otherwise structurally coupled branches. */
      readonly kind: "replace";
      readonly graph: AudioGraph;
    };

export type SplitProgramOccurrenceOptions = SplitOccurrenceOptions & {
  readonly picture?: SplitPictureGraphPlan;
  readonly audio?: SplitAudioGraphPlan;
};

export type RollProgramOccurrencesOptions = {
  readonly left: string;
  readonly right: string;
  readonly at: ExactTemporalValue;
};

export type RippleTrimProgramOccurrenceOptions = {
  readonly active: TemporalRange;
  readonly boundary: "start" | "end";
  readonly scope: readonly string[];
};
