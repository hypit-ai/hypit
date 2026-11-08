import type { CaptionSelection } from "@hypit/caption";
import type { CanonicalValue } from "@hypit/protocol";
import type { LocalTemporalDomain, TemporalMapRegion } from "@hypit/temporal/algebra";

export type CaptionStyle = {
  readonly id: string;
  readonly family: "basic";
  readonly parameters: CanonicalValue;
};

export type CaptionPresentationSelector = {
  readonly roles?: readonly string[];
  readonly cues?: readonly string[];
};

export type CaptionPresentationOverrideSpec = {
  readonly id: string;
  readonly selector: CaptionPresentationSelector;
};

export type CaptionPresentationValue =
  | { readonly kind: "style"; readonly styleId: string }
  | { readonly kind: "hidden" };

export type CaptionPresentation = {
  readonly family: "basic";
  readonly baseStyleId: string;
  readonly styles: readonly CaptionStyle[];
  readonly overrides: readonly (CaptionPresentationOverrideSpec & {
    readonly use: CaptionPresentationValue;
  })[];
};

export type CaptionScheduledCue = {
  readonly cueId: string;
  readonly unitIds: readonly string[];
  readonly role?: string;
  readonly regions: readonly TemporalMapRegion[];
  readonly styleId: string;
  readonly presentation: CaptionPresentationValue;
  readonly overrideId?: string;
};

export type CaptionPresentationSchedule = {
  readonly documentId: string;
  readonly domain: LocalTemporalDomain;
  readonly styles: readonly CaptionStyle[];
  readonly cues: readonly CaptionScheduledCue[];
};

export type CaptionCueProjection = CaptionScheduledCue & {
  readonly text: string;
  readonly occurrenceRegions?: readonly TemporalMapRegion[];
};

export type CaptionProjection = {
  readonly componentId: string;
  readonly sourceDomain: LocalTemporalDomain;
  readonly occurrenceDomain?: LocalTemporalDomain;
  readonly cues: readonly CaptionCueProjection[];
  readonly overrides: CaptionPresentation["overrides"];
};

export type CaptionBasicKaraokeParameters = {
  readonly mode: "off" | "current" | "trail";
  readonly transition: "step" | "wipe";
  readonly activeColor?: string;
};

export type CaptionBasicMaterializationSelection = CaptionSelection;
