import type { CaptionCuePayload, CaptionSelection } from "@hypit/caption";
import type { NlePackageSymbol } from "@hypit/nle";
import type { CanonicalValue } from "@hypit/protocol";
import type { ExactTemporalValue, LocalTemporalDomain, TemporalMapRegion } from "@hypit/temporal/algebra";

export type CaptionVisibilityEnvelope = {
  readonly lead?: ExactTemporalValue;
  readonly tail?: ExactTemporalValue;
  /** Cut adjacent Cues of the same Role at their spoken handoff, or retain the authored overlap. */
  readonly handoff?: "cut" | "overlap";
};

export type CaptionStyle<Family extends string = string> = {
  readonly id: string;
  readonly family: Family;
  readonly parameters: CanonicalValue;
  /** Transient authoring policy resolved into direct NLE Item times during materialization. */
  readonly visibility?: CaptionVisibilityEnvelope;
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

export type CaptionPresentation<Family extends string = string> = {
  readonly family: Family;
  readonly baseStyleId: string;
  readonly styles: readonly CaptionStyle<Family>[];
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

export type CaptionPresentationSchedule<Family extends string = string> = {
  readonly documentId: string;
  readonly domain: LocalTemporalDomain;
  readonly styles: readonly CaptionStyle<Family>[];
  readonly cues: readonly CaptionScheduledCue[];
};

export type CaptionCueProjection = CaptionScheduledCue & {
  readonly text: string;
  readonly occurrenceRegions?: readonly TemporalMapRegion[];
};

export type CaptionProjection<Family extends string = string> = {
  readonly componentId: string;
  readonly sourceDomain: LocalTemporalDomain;
  readonly occurrenceDomain?: LocalTemporalDomain;
  readonly cues: readonly CaptionCueProjection[];
  readonly overrides: CaptionPresentation<Family>["overrides"];
};

/** Transient family behavior used only while writing direct NLE facts. */
export type CaptionNleFamily<Family extends string = string> = {
  readonly family: Family;
  readonly component: NlePackageSymbol;
  parameters(caption: CaptionCuePayload, style: CaptionStyle<Family>): CanonicalValue;
};

export type CaptionNleMaterializationSelection = CaptionSelection;
