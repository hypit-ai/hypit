import type { CaptionSelection } from "@hypit/caption";
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

export type CaptionBasicMaterializationSelection = CaptionSelection & SharedCaptionNleMaterializationSelection;
