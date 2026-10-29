import type { AudioReconstructionProgram, Composition } from "@hypit/composition";
import type { TemporalDuration, TemporalMap, TemporalRelationSpec, TemporalWindow } from "@hypit/temporal";
import type { ContentFit, SpatialFrame } from "@hypit/spatial";
import type { MediaSampleAppearance, VisualClipSpec, VisualTrackHeader } from "@hypit/visual-track";

/** One concrete use of a closed child Composition in a parent Timeline. */
export type CompositionOccurrence = {
  readonly id: string;
  readonly source: Composition;
  readonly window: TemporalWindow;
  /** Occurrence-local target time to child-Composition local time. */
  readonly sampling: TemporalMap;
};

export type CompositionOccurrenceSpec = {
  readonly id: string;
  /** Omission is bounded partial identity; gaps stay transparent/silent. */
  readonly sampling?: TemporalRelationSpec;
};

export type CompositionAudioUse = {
  readonly id: string;
  readonly gain: number;
  readonly fadeIn: TemporalDuration;
  readonly fadeOut: TemporalDuration;
  readonly reconstruction?: AudioReconstructionProgram;
};

export type CompositionVisualUse = {
  readonly header: VisualTrackHeader;
  readonly frame: SpatialFrame;
  readonly fit: ContentFit;
  readonly clip: VisualClipSpec;
  readonly appearance: MediaSampleAppearance;
};

export type CompositionVisualUseSpec = Omit<CompositionVisualUse, "frame">;
