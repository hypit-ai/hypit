import type { CaptionSelection } from "@hypit/caption";
import type { FontStackRef } from "@hypit/media";
import type {
  CaptionCueProjection as SharedCaptionCueProjection,
  CaptionNleMaterializationSelection as SharedCaptionNleMaterializationSelection,
  CaptionPresentation as SharedCaptionPresentation,
  CaptionPresentationOverrideSpec as SharedCaptionPresentationOverrideSpec,
  CaptionPresentationSchedule as SharedCaptionPresentationSchedule,
  CaptionPresentationSelector as SharedCaptionPresentationSelector,
  CaptionPresentationValue as SharedCaptionPresentationValue,
  CaptionProjection as SharedCaptionProjection,
  CaptionScheduledCue as SharedCaptionScheduledCue,
  CaptionStyle as SharedCaptionStyle,
} from "@hypit/caption-nle";

export type CaptionStyle = SharedCaptionStyle<"basic">;
export type CaptionPresentationSelector = SharedCaptionPresentationSelector;
export type CaptionPresentationOverrideSpec = SharedCaptionPresentationOverrideSpec;
export type CaptionPresentationValue = SharedCaptionPresentationValue;
export type CaptionPresentation = SharedCaptionPresentation<"basic">;
export type CaptionScheduledCue = SharedCaptionScheduledCue;
export type CaptionPresentationSchedule = SharedCaptionPresentationSchedule<"basic">;
export type CaptionCueProjection = SharedCaptionCueProjection;
export type CaptionProjection = SharedCaptionProjection<"basic">;

export type CaptionBasicKaraokeParameters = {
  readonly mode: "off" | "current" | "trail";
  readonly transition: "step" | "wipe";
  readonly activeColor?: string;
};

export type CaptionBasicStyleParameters = {
  /** Exact project-owned font bytes. fontFamily is only an explicit environment fallback. */
  readonly fonts?: FontStackRef;
  readonly color?: string;
  readonly background?: string;
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontWeight?: number;
  readonly padding?: number;
  readonly borderRadius?: number;
  readonly karaoke?: CaptionBasicKaraokeParameters;
};

export type CaptionBasicMaterializationSelection = CaptionSelection & SharedCaptionNleMaterializationSelection;
