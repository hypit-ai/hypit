import type { CanonicalValue } from "@hypit/hypit/protocol";
import type { LocalSpatialDomain } from "@hypit/spatial/algebra";
import type {
  LocalTemporalDomain,
  TemporalMapRegion,
} from "@hypit/temporal/algebra";

export type CaptionDisplayWord = {
  readonly separatorBefore: "" | " ";
  readonly id: string;
  readonly unitId: string;
  readonly text: string;
  readonly attributes: readonly { readonly name: string; readonly value: string | number | boolean }[];
};

export type CaptionUnit = { readonly id: string; readonly wordIds: readonly string[] };

export type CaptionCue = {
  readonly id: string;
  readonly unitIds: readonly string[];
  readonly role?: string;
};

/** Display truth only; it owns no measured time or media identity. */
export type CaptionDocument = {
  readonly id: string;
  readonly units: readonly CaptionUnit[];
  readonly words: readonly CaptionDisplayWord[];
  readonly cues: readonly CaptionCue[];
};

export type LocalCaptionTiming = {
  readonly documentId: string;
  readonly domain: LocalTemporalDomain;
  readonly units: readonly {
    readonly unitId: string;
    readonly regions: readonly TemporalMapRegion[];
  }[];
};

export type CaptionSelection =
  | { readonly kind: "all" }
  | { readonly kind: "cues"; readonly ids: readonly string[] }
  | { readonly kind: "units"; readonly ids: readonly string[] };

export type CaptionStyle = {
  readonly id: string;
  readonly family: string;
  readonly parameters: CanonicalValue;
};

/** Source-local content predicate. Fields combine by intersection. */
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

/** Ordered source-local presentation owned by one Caption component instance. */
export type CaptionPresentation = {
  readonly family: string;
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
  readonly presentation: CaptionPresentationValue;
  /** The last matching override, omitted when base presentation wins. */
  readonly overrideId?: string;
};

/** Exact source-local schedule; terminal frame conversion is not part of this value. */
export type CaptionPresentationSchedule = {
  readonly documentId: string;
  readonly domain: LocalTemporalDomain;
  readonly styles: readonly CaptionStyle[];
  readonly cues: readonly CaptionScheduledCue[];
};

export type CaptionCueProjection = CaptionScheduledCue & {
  readonly text: string;
  /** Occurrence-local preimage; omitted for a source-only inspection. */
  readonly occurrenceRegions?: readonly TemporalMapRegion[];
};

/** Owner projection for an expandable Caption Occurrence; never a parent Programme object. */
export type CaptionProjection = {
  readonly componentId: string;
  readonly sourceDomain: LocalTemporalDomain;
  readonly occurrenceDomain?: LocalTemporalDomain;
  readonly cues: readonly CaptionCueProjection[];
  readonly overrides: CaptionPresentation["overrides"];
};

export type CaptionComponentSpec = {
  readonly id: string;
  readonly pictureDomain: LocalSpatialDomain;
  readonly selection: CaptionSelection;
};

export type CaptionUnitEventSpec = {
  readonly unitId: string;
  readonly edge: "start" | "end";
};
